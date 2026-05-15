import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { BrowserWindow } from 'electron'

const execFileP = promisify(execFile)

const CANDIDATE_PATHS = [
  process.env.CLAUDE_BIN,
  `${process.env.HOME}/.local/bin/claude`,
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
  return {
    ok: false,
    error: '未找到 claude CLI。请先安装 Claude Code 并完成 `claude login`,或设置 CLAUDE_BIN 环境变量指向可执行路径。',
  }
}

async function getClaudeBin(): Promise<string> {
  if (_claudeBin) return _claudeBin
  const info = await detectClaude()
  if (!info.ok || !info.path) throw new Error(info.error ?? 'claude not found')
  return info.path
}

// ── Analysis prompt ────────────────────────────────────────────────────────────

function buildAnalysisPrompt(symbol: string, context: AnalysisContext): string {
  const lines: string[] = [
    `请对 ${symbol} 做深度分析,使用中文回答,按以下结构输出:`,
    '',
    `## 1. 今日涨跌归因`,
    `分析 ${symbol} 今日涨跌的主要原因(基本面、消息面、技术面各角度)`,
    '',
    `## 2. 买入理由`,
    `如果现在买入,最主要的逻辑是什么?`,
    '',
    `## 3. 卖出/做空理由`,
    `如果卖出或做空,最主要的逻辑是什么?`,
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
    lines.push(`基于当前 IV、趋势和风险,建议什么期权策略?仓位比例多少合适?为什么?`)
    lines.push('')
  }

  if (context.price) lines.push(`当前价格: $${context.price}`)
  if (context.changePercent !== undefined) lines.push(`今日涨跌: ${context.changePercent >= 0 ? '+' : ''}${context.changePercent.toFixed(2)}%`)
  if (context.costBasis) lines.push(`持仓成本: $${context.costBasis}(持有中)`)
  if (context.recentNews?.length) {
    lines.push('', '近期新闻摘要:')
    context.recentNews.slice(0, 5).forEach((n, i) => lines.push(`${i + 1}. ${n}`))
  }

  return lines.join('\n')
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

// ── Streaming analysis ─────────────────────────────────────────────────────────

const activeProcesses = new Map<string, ReturnType<typeof spawn>>()

export async function startAnalysis(
  symbol: string,
  context: AnalysisContext,
  win: BrowserWindow,
): Promise<{ sessionId: string }> {
  const sessionId = `analysis-${symbol}-${Date.now()}`
  const claudeBin = await getClaudeBin()
  const prompt = buildAnalysisPrompt(symbol, context)

  // kill any existing analysis for this symbol
  for (const [id, proc] of activeProcesses) {
    if (id.startsWith(`analysis-${symbol}`)) {
      proc.kill()
      activeProcesses.delete(id)
    }
  }

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--allowedTools', 'WebFetch,WebSearch',
    '--verbose',
  ]

  const proc = spawn(claudeBin, args, {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  activeProcesses.set(sessionId, proc)

  let buffer = ''

  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line) as Record<string, unknown>
        // stream-json emits {type, ...} events
        if (msg.type === 'content_block_delta') {
          const delta = msg.delta as Record<string, unknown> | undefined
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            win.webContents.send('analysis:chunk', { type: 'token', text: delta.text, sessionId } as AnalysisChunk)
          }
        } else if (msg.type === 'message_stop') {
          win.webContents.send('analysis:chunk', { type: 'done', sessionId } as AnalysisChunk)
        }
      } catch {
        // non-JSON line, ignore
      }
    }
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    // only surface real errors, not progress logs
    if (text.includes('Error') || text.includes('error')) {
      console.error('[claude stderr]', text.slice(0, 200))
    }
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
      // ensure done is sent even if message_stop was missed
      win.webContents.send('analysis:chunk', { type: 'done', sessionId } as AnalysisChunk)
    }
  })

  proc.on('error', (err) => {
    win.webContents.send('analysis:chunk', {
      type: 'error',
      error: err.message,
      sessionId,
    } as AnalysisChunk)
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
