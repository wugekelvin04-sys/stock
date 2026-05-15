import cron from 'node-cron'
import Holidays from 'date-holidays'
import { BrowserWindow, Notification, Tray } from 'electron'
import { spawn } from 'node:child_process'
import { getClaudeBinPath } from './claudeHelper'
import { saveDailyPicks, saveInsight, listHoldings } from './db'
import type { DailyPick } from './db'

// Tray reference for status updates
let _tray: Tray | null = null
export function setSchedulerTray(tray: Tray) { _tray = tray }

const hd = new Holidays('US')

// ── Market calendar helpers ────────────────────────────────────────────────────

function isNYSETradingDay(date = new Date()): boolean {
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  const holiday = hd.isHoliday(date)
  if (!holiday) return true
  // only NYSE-closing holidays matter
  const NYSE_CLOSED = ['New Year\'s Day', 'Martin Luther King Jr. Day', 'Presidents\' Day',
    'Good Friday', 'Memorial Day', 'Juneteenth National Independence Day',
    'Independence Day', 'Labor Day', 'Thanksgiving Day', 'Christmas Day']
  return !holiday.some((h) => NYSE_CLOSED.some((name) => h.name.includes(name)))
}

/** Convert "HH:MM" ET to current local Date */
function etTimeToLocal(hhmm: string): Date {
  const [hh, mm] = hhmm.split(':').map(Number)
  const now = new Date()
  // ET = UTC-5 (EST) or UTC-4 (EDT). Use Intl to get current ET offset.
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  const et = new Date(etStr)
  const diff = now.getTime() - et.getTime() // ms offset local vs ET
  const target = new Date()
  target.setHours(hh, mm, 0, 0)
  return new Date(target.getTime() + diff)
}

function nowInET(): { hour: number; minute: number } {
  const et = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
  const [h, m] = et.split(':').map(Number)
  return { hour: h, minute: m }
}

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD
}

// ── claude runner ─────────────────────────────────────────────────────────────

function runClaude(claudeBin: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(claudeBin, [
      '-p', prompt,
      '--output-format', 'json',
      '--allowedTools', 'WebFetch,WebSearch',
    ], { env: process.env })
    let out = ''
    let err = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { err += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exit ${code}: ${err.slice(0, 200)}`))
      else resolve(out)
    })
    proc.on('error', reject)
  })
}

function extractText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { result?: string; content?: Array<{ text?: string }> }
    if (parsed.result) return parsed.result
    if (parsed.content) return parsed.content.map((c) => c.text ?? '').join('')
  } catch { /* raw text fallback */ }
  return raw.trim()
}

// ── Daily picks (09:00 ET) ────────────────────────────────────────────────────

async function runDailyScreen(claudeBin: string) {
  const date = todayET()
  console.log(`[scheduler] Running daily screen for ${date}`)

  const prompt = `今天是 ${date}。请分析美股市场,选出今日最值得关注的 10 支股票。
结合昨日收盘后新闻、技术面趋势、板块轮动,给出具体 ticker 和一句话理由。
严格输出 JSON 数组格式,不要其他文字:
[{"symbol":"AAPL","reason":"苹果发布超预期财报,AI 服务收入大增"},...]`

  try {
    const raw = await runClaude(claudeBin, prompt)
    const text = extractText(raw)
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')
    const picks = JSON.parse(match[0]) as DailyPick[]
    saveDailyPicks(date, picks)
    console.log(`[scheduler] Saved ${picks.length} daily picks`)

    notify('今日机会榜已更新', `Claude 为你精选了 ${picks.length} 支值得关注的股票`)

    // broadcast to renderer
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('scheduler:daily-picks-updated', { date, picks })
    )
  } catch (e) {
    console.error('[scheduler] daily screen failed:', (e as Error).message)
  }
}

// ── Hourly insight (整点 09:30-16:00 ET) ─────────────────────────────────────

async function runHourlyInsight(claudeBin: string) {
  const holdings = listHoldings()
  if (holdings.length === 0) {
    console.log('[scheduler] No holdings, skipping insight')
    return
  }

  const { hour } = nowInET()
  const snapshot = holdings.map((h) =>
    `${h.symbol}(${h.type}) ×${h.qty} 成本$${h.costBasis}`
  ).join(', ')

  const prompt = `现在是美东时间 ${hour}:00。请对以下持仓做一个简短的市场 insight(200字以内,中文):
持仓: ${snapshot}
分析要点:当前整体趋势、今日主要驱动因素、需要关注的风险点、接下来一小时的操作建议。`

  console.log(`[scheduler] Running hourly insight at ET ${hour}:00`)
  try {
    const raw = await runClaude(claudeBin, prompt)
    const text = extractText(raw)
    saveInsight(text, snapshot)
    console.log('[scheduler] Insight saved')

    notify(`${hour}:00 持仓 Insight`, text.slice(0, 80) + '…')

    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('scheduler:insight-updated', { content: text, triggeredAt: Date.now() })
    )
  } catch (e) {
    console.error('[scheduler] hourly insight failed:', (e as Error).message)
  }
}

// ── Notification helper ────────────────────────────────────────────────────────

function notify(title: string, body: string) {
  if (!Notification.isSupported()) return
  new Notification({ title, body, silent: false }).show()
}

// ── Tray market-hours indicator ────────────────────────────────────────────────

export function updateTrayStatus() {
  if (!_tray) return
  const trading = isNYSETradingDay()
  const { hour, minute } = nowInET()
  const isOpen = trading && (
    (hour === 9 && minute >= 30) || (hour > 9 && hour < 16) || (hour === 16 && minute === 0)
  )
  // Green dot during market hours, plain during closed
  _tray.setTitle(isOpen ? '●' : '·')
  _tray.setToolTip(isOpen ? 'Stock Desk · 市场开盘中' : 'Stock Desk · 市场休市')
}

// ── Public scheduler API ───────────────────────────────────────────────────────

let started = false

export async function startScheduler() {
  if (started) return
  started = true

  let claudeBin: string
  try {
    claudeBin = await getClaudeBinPath()
  } catch (e) {
    console.warn('[scheduler] claude not found, scheduler disabled:', (e as Error).message)
    return
  }

  // Update tray status every 5 minutes
  updateTrayStatus()
  cron.schedule('*/5 * * * *', updateTrayStatus)

  // Daily picks: every day at 09:00 ET → run as cron in local time with ET check
  // Cron runs every minute at :00 of 9th hour — but we check ET inside
  cron.schedule('0 * * * *', async () => {
    if (!isNYSETradingDay()) return
    const { hour, minute } = nowInET()
    // 09:00 ET → daily screen
    if (hour === 9 && minute === 0) {
      await runDailyScreen(claudeBin)
    }
    // 09:30–16:00 ET on the hour → hourly insight
    if (hour >= 9 && hour <= 16 && minute === 0) {
      if (hour === 9) return // 09:00 is daily screen, not insight
      await runHourlyInsight(claudeBin)
    }
  })

  // Also run daily screen at 09:30 if user opens app after 09:00
  cron.schedule('30 * * * *', async () => {
    if (!isNYSETradingDay()) return
    const { hour, minute } = nowInET()
    if (hour === 9 && minute === 30) {
      await runHourlyInsight(claudeBin) // first insight of the day
    }
  })

  console.log('[scheduler] Started. Monitoring NYSE trading hours.')
}

export function stopScheduler() {
  cron.getTasks().forEach((task) => task.stop())
  started = false
}
