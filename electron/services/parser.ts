import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { detectClaude } from './claude'

export interface HoldingRecord {
  symbol: string
  type: 'stock' | 'option'
  qty: number
  costBasis: number
  strike?: number
  expiry?: string
  side?: 'call' | 'put'
  direction?: 'buy' | 'sell'
  exchange?: string
}

const STOCK_PROMPT = `请从这张截图中提取【股票】持仓信息（不含期权）。
输出严格的 JSON 数组,格式:
[{"symbol":"AAPL","type":"stock","qty":100,"costBasis":150.5,"strike":null,"expiry":null,"side":null,"direction":null}]
字段说明:
- type: 固定填 "stock"
- side/strike/expiry: 均填 null
- direction: 做多填 "buy", 做空填 "sell", 不确定填 null
- costBasis: 每股平均成本/持仓均价
- qty: 持仓股数(整数)
如果识别不到任何持仓,返回空数组 []。
只输出 JSON 数组,不要任何其他文字或 markdown。`

const OPTION_PROMPT = `请从这张截图中提取【期权】持仓信息（不含股票）。
输出严格的 JSON 数组,格式:
[{"symbol":"AAPL","type":"option","qty":2,"costBasis":3.50,"strike":200,"expiry":"2025-06-20","side":"call","direction":"buy"}]
字段说明:
- type: 固定填 "option"
- side: "call" 或 "put"
- direction: 买入期权填 "buy", 卖出/做空期权填 "sell"
- costBasis: 每股期权金(premium per share, 不乘以100)
- qty: 合约张数(整数)
- strike: 行权价(数字)
- expiry: 到期日 YYYY-MM-DD 格式
如果识别不到任何期权持仓,返回空数组 []。
只输出 JSON 数组,不要任何其他文字或 markdown。`

const AUTO_PROMPT = `请从这张截图中提取股票和期权持仓信息。
输出严格的 JSON 数组,格式:
[{"symbol":"AAPL","type":"stock","qty":100,"costBasis":150.5,"strike":null,"expiry":null,"side":null,"direction":null}]
字段说明:
- type: "stock" 或 "option"
- side: 期权类型 "call"/"put", 股票填 null
- direction: 买入填 "buy", 卖出/做空填 "sell", 不确定填 null
- costBasis: 股票为每股均价; 期权为每股期权金(premium per share)
- strike: 期权行权价, 股票填 null
- expiry: 期权到期日 YYYY-MM-DD, 股票填 null
- qty: 股票为股数, 期权为合约张数
如果识别不到任何持仓,返回空数组 []。
只输出 JSON 数组,不要任何其他文字或 markdown。`

async function pdfToImages(filePath: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js') as typeof import('pdfjs-dist')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas } = require('canvas') as typeof import('canvas')

  const data = await fs.readFile(filePath)
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
  const images: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx as any, viewport, canvas: canvas as any }).promise
    images.push(canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''))
  }
  return images
}

async function imageToBase64(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  return buf.toString('base64')
}

function makeEnv() {
  return {
    HOME: os.homedir(),
    USER: os.userInfo().username,
    LOGNAME: os.userInfo().username,
    TMPDIR: os.tmpdir(),
    PATH: [`${os.homedir()}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH ?? ''].join(':'),
    ...(['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_BIN', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME']
      .reduce((acc, k) => { if (process.env[k]) acc[k] = process.env[k]!; return acc }, {} as Record<string, string>)),
  }
}

function runClaude(claudeBin: string, prompt: string, imageBase64List: { data: string; mediaType: string }[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // Build a stream-json message with image blocks + text block
    const content: unknown[] = imageBase64List.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
    }))
    content.push({ type: 'text', text: prompt })

    const inputMsg = JSON.stringify({
      type: 'user',
      message: { role: 'user', content },
    })

    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      '--mcp-config', '{"mcpServers":{}}',
      '--strict-mcp-config',
    ]

    const proc = spawn(claudeBin, args, { env: makeEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
    proc.on('spawn', () => { proc.stdin!.write(inputMsg + '\n'); proc.stdin!.end() })

    let buffer = ''
    let fullText = ''
    let stderr = ''
    proc.stdout!.on('data', (d: Buffer) => {
      buffer += d.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as Record<string, unknown>
          if (msg.type === 'result') {
            const r = msg.result as string | undefined
            if (r) fullText = r
          } else if (msg.type === 'assistant') {
            const blocks = ((msg.message as Record<string, unknown>)?.content ?? []) as Record<string, unknown>[]
            for (const b of blocks) {
              if (b.type === 'text' && typeof b.text === 'string') fullText += b.text
            }
          }
        } catch { /* non-JSON line */ }
      }
    })
    proc.stderr!.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr.slice(0, 400)}`))
      else resolve(fullText)
    })
    proc.on('error', reject)
  })
}

function parseClaudeOutput(raw: string): HoldingRecord[] {
  // claude --output-format json wraps in {result: "..."}
  let text = raw.trim()
  try {
    const wrapper = JSON.parse(text) as { result?: string }
    if (wrapper.result) text = wrapper.result
  } catch {
    // raw might already be the array
  }
  // extract JSON array
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  const arr = JSON.parse(match[0]) as Array<Record<string, unknown>>
  return arr
    .filter((r) => r.symbol && r.type)
    .map((r) => ({
      symbol: String(r.symbol).toUpperCase(),
      type: r.type === 'option' ? 'option' : 'stock',
      qty: Number(r.qty ?? 0),
      costBasis: Number(r.costBasis ?? r.cost_basis ?? 0),
      strike: r.strike != null ? Number(r.strike) : undefined,
      expiry: r.expiry ? String(r.expiry) : undefined,
      side: r.side === 'call' || r.side === 'put' ? r.side : undefined,
      direction: r.direction === 'buy' || r.direction === 'sell' ? r.direction : undefined,
      exchange: r.exchange ? String(r.exchange) : undefined,
    }))
}

function mediaTypeFromExt(ext: string): string {
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  return 'image/png'
}

export type ImportHint = 'stock' | 'option' | 'auto'

export async function parseFile(filePath: string, hint: ImportHint = 'auto'): Promise<HoldingRecord[]> {
  const info = await detectClaude()
  if (!info.ok || !info.path) {
    throw new Error(info.error ?? 'claude CLI not found')
  }

  const ext = path.extname(filePath).toLowerCase()
  let images: { data: string; mediaType: string }[]

  if (ext === '.pdf') {
    const base64List = await pdfToImages(filePath)
    images = base64List.map(data => ({ data, mediaType: 'image/png' }))
  } else {
    const data = await imageToBase64(filePath)
    images = [{ data, mediaType: mediaTypeFromExt(ext) }]
  }

  const prompt = hint === 'stock' ? STOCK_PROMPT : hint === 'option' ? OPTION_PROMPT : AUTO_PROMPT
  const raw = await runClaude(info.path, prompt, images)
  return parseClaudeOutput(raw)
}
