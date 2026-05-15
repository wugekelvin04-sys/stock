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
  exchange?: string
}

const EXTRACT_PROMPT = `请从这张截图中提取股票持仓信息。
输出严格的 JSON 数组,格式:
[{"symbol":"AAPL","type":"stock","qty":100,"costBasis":150.5,"strike":null,"expiry":null,"side":null}]
type 为 stock 或 option。期权才有 strike/expiry/side(call 或 put)。
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

function runClaude(claudeBin: string, prompt: string, imagePaths: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      '--mcp-config', '{"mcpServers":{}}',
      '--strict-mcp-config',
    ]
    for (const img of imagePaths) {
      args.push('--image', img)
    }
    const proc = spawn(claudeBin, args, { env: makeEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
    proc.on('spawn', () => { proc.stdin!.write(prompt); proc.stdin!.end() })
    let stdout = ''
    let stderr = ''
    proc.stdout!.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr!.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`))
      else resolve(stdout)
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
      exchange: r.exchange ? String(r.exchange) : undefined,
    }))
}

export async function parseFile(filePath: string): Promise<HoldingRecord[]> {
  const info = await detectClaude()
  if (!info.ok || !info.path) {
    throw new Error(info.error ?? 'claude CLI not found')
  }

  const ext = path.extname(filePath).toLowerCase()
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-parse-'))
  const tmpImages: string[] = []

  try {
    let base64Images: string[]

    if (ext === '.pdf') {
      base64Images = await pdfToImages(filePath)
    } else {
      base64Images = [await imageToBase64(filePath)]
    }

    // write base64 images to tmp files so claude --image can read them
    for (let i = 0; i < base64Images.length; i++) {
      const tmpImg = path.join(tmpDir, `page-${i}.png`)
      await fs.writeFile(tmpImg, Buffer.from(base64Images[i], 'base64'))
      tmpImages.push(tmpImg)
    }

    const raw = await runClaude(info.path, EXTRACT_PROMPT, tmpImages)
    return parseClaudeOutput(raw)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}
