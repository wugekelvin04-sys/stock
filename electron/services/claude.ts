import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { BrowserWindow } from 'electron'
import os from 'node:os'

const execFileP = promisify(execFile)

const CANDIDATE_PATHS = [
  process.env.CLAUDE_BIN,
  `${os.homedir()}/.local/bin/claude`,
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  'claude',
].filter(Boolean) as string[]

export interface ClaudeInfo {
  ok: boolean
  version?: string
  path?: string
  error?: string
}

let _claudeBin: string | null = null

export async function detectClaude(): Promise<ClaudeInfo> {
  for (const bin of CANDIDATE_PATHS) {
    try {
      const { stdout } = await execFileP(bin, ['--version'], { timeout: 5000 })
      const version = stdout.trim().split('\n')[0]
      _claudeBin = bin
      return { ok: true, version, path: bin }
    } catch {
      continue
    }
  }
  return { ok: false, error: '未找到 claude CLI' }
}

async function getClaudeBin(): Promise<string> {
  if (_claudeBin) return _claudeBin
  const info = await detectClaude()
  if (!info.ok || !info.path) throw new Error(info.error ?? 'claude not found')
  return info.path
}

// ── Analysis prompt ────────────────────────────────────────────────────────────

export type AnalysisMode = 'full' | 'why' | 'call' | 'trend'

function contextSuffix(symbol: string, context: AnalysisContext): string {
  const lines: string[] = []
  if (context.price) lines.push(`当前价格: $${context.price}`)
  if (context.changePercent !== undefined) lines.push(`今日涨跌: ${context.changePercent >= 0 ? '+' : ''}${context.changePercent.toFixed(2)}%`)
  if (context.costBasis) lines.push(`持仓成本: $${context.costBasis}（持有中）`)
  if (context.recentNews?.length) {
    lines.push('', '近期新闻摘要:')
    context.recentNews.slice(0, 5).forEach((n, i) => lines.push(`${i + 1}. ${n}`))
  }
  return lines.length ? '\n\n' + lines.join('\n') : ''
}

function buildAnalysisPrompt(symbol: string, context: AnalysisContext, mode: AnalysisMode = 'full'): string {
  const suffix = contextSuffix(symbol, context)

  if (mode === 'why') {
    return `用 WebSearch 搜索 ${symbol} 今日最新消息，然后用中文简明回答：

## 今日涨跌原因
${symbol} 今天为什么涨/跌？从消息面、基本面、技术面各角度分析，控制在 300 字以内。${suffix}`
  }

  if (mode === 'call') {
    return `用 WebSearch 搜索 ${symbol} 最新消息和期权数据，然后用中文回答：

## 买 Call 建议
1. **当前趋势判断**：现在是否适合买 Call？
2. **建议行权价**：推荐哪个行权价（ATM/OTM 多少）？为什么？
3. **建议到期日**：推荐哪个到期日？为什么？
4. **入场时机**：现在直接买还是等回调？等什么位置？
5. **止损/止盈**：期权价格涨跌多少时止盈/止损？
6. **风险提示**：主要风险是什么？${suffix}`
  }

  if (mode === 'trend') {
    return `用 WebSearch 搜索 ${symbol} 最新消息、机构评级和技术面，然后用中文回答：

## 后市趋势预测
1. **短期（1-2周）**：方向判断及理由
2. **中期（1-3个月）**：关键支撑/压力位
3. **关键催化剂**：近期有哪些重要事件（财报、产品发布、宏观数据）？
4. **技术面**：当前处于什么形态？
5. **机构观点**：最新分析师目标价和评级${suffix}`
  }

  // full
  const lines: string[] = [
    `请对 ${symbol} 做深度分析，先用 WebSearch 搜索该股票最新新闻和基本面数据，然后使用中文回答，按以下结构输出:`,
    '',
    `## 1. 今日涨跌归因`,
    `分析 ${symbol} 今日涨跌的主要原因(基本面、消息面、技术面各角度)`,
    '',
    `## 2. 买入理由`,
    `如果现在买入，最主要的逻辑是什么?`,
    '',
    `## 3. 卖出/做空理由`,
    `如果卖出或做空，最主要的逻辑是什么?`,
    '',
    `## 4. 主要利好`,
    `列出 3-5 条当前最重要的利好因素`,
    '',
    `## 5. 主要利空`,
    `列出 3-5 条当前最重要的利空因素`,
    '',
  ]
  if (context.hasOptions) {
    lines.push(`## 6. 期权策略建议`)
    lines.push(`基于当前 IV、趋势和风险，建议什么期权策略？仓位比例多少合适？为什么？`)
    lines.push('')
  }
  return lines.join('\n') + suffix
}

export interface AnalysisContext {
  price?: number
  changePercent?: number
  costBasis?: number
  hasOptions?: boolean
  recentNews?: string[]
}

export interface AnalysisChunk {
  type: 'token' | 'done' | 'error'
  text?: string
  error?: string
  sessionId?: string
}

// ── Streaming analysis via CLI ─────────────────────────────────────────────────

const activeProcesses = new Map<string, ReturnType<typeof spawn>>()

export async function startAnalysis(
  symbol: string,
  context: AnalysisContext,
  win: BrowserWindow,
  mode: AnalysisMode = 'full',
): Promise<{ sessionId: string }> {
  const sessionId = `analysis-${symbol}-${Date.now()}`
  const prompt = buildAnalysisPrompt(symbol, context, mode)

  for (const [id, proc] of activeProcesses) {
    if (id.startsWith(`analysis-${symbol}`)) {
      proc.kill()
      activeProcesses.delete(id)
    }
  }

  // Pre-detect claude bin synchronously from cache if available, else use known path
  const claudeBin = _claudeBin ?? `${os.homedir()}/.local/bin/claude`

  const args = [
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
    '--mcp-config', '{"mcpServers":{}}',
    '--strict-mcp-config',
  ]

  // Ensure claude gets a full shell environment — Electron may strip PATH etc.
  const spawnEnv = {
    HOME: os.homedir(),
    USER: os.userInfo().username,
    LOGNAME: os.userInfo().username,
    TMPDIR: os.tmpdir(),
    PATH: [
      `${os.homedir()}/.local/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      process.env.PATH ?? '',
    ].join(':'),
    // Pass through auth-related env vars
    ...(['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_BIN',
         'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED',
         'XDG_CONFIG_HOME', 'XDG_DATA_HOME'].reduce((acc, k) => {
      if (process.env[k]) acc[k] = process.env[k]!
      return acc
    }, {} as Record<string, string>)),
  }

  const proc = spawn(claudeBin, args, {
    env: spawnEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  activeProcesses.set(sessionId, proc)

  proc.on('spawn', () => {
    proc.stdin!.write(prompt)
    proc.stdin!.end()
  })

  let buffer = ''
  proc.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line) as Record<string, unknown>
        if (msg.type === 'assistant') {
          const content = (msg.message as Record<string, unknown>)?.content
          if (Array.isArray(content)) {
            for (const block of content as Record<string, unknown>[]) {
              if (block.type === 'text' && typeof block.text === 'string' && block.text) {
                win.webContents.send('analysis:chunk', { type: 'token', text: block.text, sessionId } as AnalysisChunk)
              } else if (block.type === 'tool_use') {
                const toolName = block.name as string
                const input = block.input as Record<string, unknown>
                let hint = ''
                if (toolName === 'WebSearch' || toolName === 'mcp__tavily__search') {
                  hint = `\n> 🔍 搜索: ${input.query ?? ''}\n`
                } else if (toolName === 'WebFetch') {
                  hint = `\n> 📄 读取页面...\n`
                } else if (toolName === 'Agent') {
                  hint = `\n> 🤖 子任务: ${input.description ?? ''}\n`
                } else {
                  hint = `\n> ⚙️ ${toolName}...\n`
                }
                win.webContents.send('analysis:chunk', { type: 'token', text: hint, sessionId } as AnalysisChunk)
              }
            }
          }
        } else if (msg.type === 'result') {
          win.webContents.send('analysis:chunk', { type: 'done', sessionId } as AnalysisChunk)
        }
      } catch { /* non-JSON line */ }
    }
  })

  proc.stderr!.on('data', (chunk: Buffer) => {
    console.error('[claude stderr]', chunk.toString().slice(0, 200))
  })

  proc.on('close', (code) => {
    activeProcesses.delete(sessionId)
    if (code !== 0 && code !== null) {
      win.webContents.send('analysis:chunk', {
        type: 'error',
        error: `claude 进程退出 (code ${code})`,
        sessionId,
      } as AnalysisChunk)
    } else {
      win.webContents.send('analysis:chunk', { type: 'done', sessionId } as AnalysisChunk)
    }
  })

  proc.on('error', (err) => {
    win.webContents.send('analysis:chunk', { type: 'error', error: err.message, sessionId } as AnalysisChunk)
  })

  return { sessionId }
}

export function cancelAnalysis(sessionId: string) {
  const proc = activeProcesses.get(sessionId)
  if (proc) {
    proc.kill()
    activeProcesses.delete(sessionId)
  }
}

// ── Free-form chat ─────────────────────────────────────────────────────────────

export interface ChatMessage { role: 'user' | 'assistant'; text: string }

export async function startChat(
  prompt: string,
  win: BrowserWindow,
  sessionId: string,
): Promise<void> {
  // Kill any existing chat session
  const existing = activeProcesses.get(sessionId)
  if (existing) { existing.kill(); activeProcesses.delete(sessionId) }

  const claudeBin = _claudeBin ?? `${os.homedir()}/.local/bin/claude`

  const args = [
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
    '--mcp-config', '{"mcpServers":{}}',
    '--strict-mcp-config',
  ]

  const spawnEnv = {
    HOME: os.homedir(),
    USER: os.userInfo().username,
    LOGNAME: os.userInfo().username,
    TMPDIR: os.tmpdir(),
    PATH: [
      `${os.homedir()}/.local/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      process.env.PATH ?? '',
    ].join(':'),
    ...(['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_BIN',
         'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED',
         'XDG_CONFIG_HOME', 'XDG_DATA_HOME'].reduce((acc, k) => {
      if (process.env[k]) acc[k] = process.env[k]!
      return acc
    }, {} as Record<string, string>)),
  }

  const proc = spawn(claudeBin, args, { env: spawnEnv, stdio: ['pipe', 'pipe', 'pipe'] })
  activeProcesses.set(sessionId, proc)

  proc.on('spawn', () => {
    proc.stdin!.write(prompt)
    proc.stdin!.end()
  })

  let buffer = ''
  proc.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line) as Record<string, unknown>
        if (msg.type === 'assistant') {
          const content = (msg.message as Record<string, unknown>)?.content
          if (Array.isArray(content)) {
            for (const block of content as Record<string, unknown>[]) {
              if (block.type === 'text' && typeof block.text === 'string' && block.text) {
                win.webContents.send('chat:chunk', { type: 'token', text: block.text, sessionId })
              } else if (block.type === 'tool_use') {
                const toolName = block.name as string
                const input = block.input as Record<string, unknown>
                let hint = ''
                if (toolName === 'WebSearch' || toolName === 'mcp__tavily__search') {
                  hint = `\n> 🔍 搜索: ${input.query ?? ''}\n`
                } else if (toolName === 'WebFetch') {
                  hint = `\n> 📄 读取页面...\n`
                } else {
                  hint = `\n> ⚙️ ${toolName}...\n`
                }
                win.webContents.send('chat:chunk', { type: 'token', text: hint, sessionId })
              }
            }
          }
        } else if (msg.type === 'result') {
          win.webContents.send('chat:chunk', { type: 'done', sessionId })
        }
      } catch { /* non-JSON line */ }
    }
  })

  proc.stderr!.on('data', (chunk: Buffer) => {
    console.error('[chat stderr]', chunk.toString().slice(0, 200))
  })

  proc.on('close', (code) => {
    activeProcesses.delete(sessionId)
    if (code !== 0 && code !== null) {
      win.webContents.send('chat:chunk', { type: 'error', error: `claude 退出 (code ${code})`, sessionId })
    } else {
      win.webContents.send('chat:chunk', { type: 'done', sessionId })
    }
  })

  proc.on('error', (err) => {
    win.webContents.send('chat:chunk', { type: 'error', error: err.message, sessionId })
  })
}
