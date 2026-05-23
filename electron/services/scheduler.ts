import cron from 'node-cron'
import Holidays from 'date-holidays'
import { BrowserWindow, Notification, Tray } from 'electron'
import { saveDailyPicks, saveInsight, listHoldings, saveSectorPicks, getLatestSectorPicks, getLatestDailyPicks, listWatchGroups, listWatchItems, cacheGet, getPrefetchSettings } from './db'
import type { DailyPick, SectorPick } from './db'
import { prefetchSymbol } from '../ipc/stock'
import { generateOpenRouterText } from './ai/openrouter'

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

// ── Daily picks ───────────────────────────────────────────────────────────────

const PICKS_PROMPT = (date: string) =>
  `今天是 ${date}。请搜索今日美股市场最新动态，然后选出今日最值得关注的 10 支股票。
结合昨日收盘后新闻、技术面趋势、板块轮动，给出具体 ticker 和一句话中文理由（20字以内，说明核心机会）。
严格输出 JSON 数组格式，不要任何其他文字：
[{"symbol":"AAPL","reason":"苹果发布超预期财报，AI 服务收入大增"},...]`

// onProgress receives each streamed text chunk for live display
export async function triggerDailyPicks(onProgress?: (text: string) => void): Promise<void> {
  const date = todayET()
  console.log(`[scheduler] Running daily screen for ${date}`)

  const fullText = await generateOpenRouterText(PICKS_PROMPT(date), {
    modelRole: 'search',
    search: true,
    onToken: onProgress,
  })
  const start = fullText.indexOf('[')
  const end = fullText.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) throw new Error('响应中未找到 JSON 数组，原始输出: ' + fullText.slice(0, 200))
  const picks = JSON.parse(fullText.slice(start, end + 1)) as DailyPick[]
  if (!picks.length) throw new Error('解析到的机会榜为空')
  saveDailyPicks(date, picks)
  console.log(`[scheduler] Saved ${picks.length} daily picks`)
  notify('今日机会榜已更新', `AI 为你精选了 ${picks.length} 支值得关注的股票`)
  BrowserWindow.getAllWindows().forEach((w) =>
    w.webContents.send('scheduler:daily-picks-updated', { date, picks })
  )
}

// ── Sector picks ─────────────────────────────────────────────────────────────

const SECTOR_PICKS_PROMPT = (date: string) =>
  `今天是 ${date}（美东时间）。请搜索今日美股主要板块的最新动态，然后输出今日最值得关注的 6 个板块及每个板块推荐的 6 只个股。

要求：
- 板块名称用中文（如：半导体、AI基建、军工、核电、生物医药、中概、金融等）
- etf 字段填该板块最具代表性的 ETF ticker（如 SOXX、QQQ、ITA、NLR、XBI、KWEB、XLF 等）
- changeHint 用一句中文（15字内）说明今日该板块的核心驱动
- 每个板块推荐 6 只个股，reason 说明今日选择该股的具体理由（20字内）
- 按今日表现/关注度从高到低排序

严格输出 JSON 数组，不要任何其他文字：
[
  {
    "name": "半导体",
    "etf": "SOXX",
    "changeHint": "出口限制松绑带动整体反弹",
    "stocks": [
      {"symbol": "NVDA", "reason": "AI芯片需求超预期，盘前大涨"},
      {"symbol": "AMD", "reason": "服务器CPU市占率持续提升"},
      {"symbol": "AVGO", "reason": "自研AI芯片订单超预期"},
      {"symbol": "MU", "reason": "HBM内存需求爆发，订单饱满"},
      {"symbol": "AMAT", "reason": "先进制程设备出货加速"},
      {"symbol": "QCOM", "reason": "端侧AI芯片渗透率提升"}
    ]
  },
  ...
]`

export async function triggerSectorPicks(onProgress?: (text: string) => void): Promise<void> {
  const date = todayET()
  const fullText = await generateOpenRouterText(SECTOR_PICKS_PROMPT(date), {
    modelRole: 'search',
    search: true,
    onToken: onProgress,
  })
  // Find the outermost JSON array robustly
  const start = fullText.indexOf('[')
  const end = fullText.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) throw new Error('板块分析响应中未找到 JSON 数组: ' + fullText.slice(0, 200))
  const picks = JSON.parse(fullText.slice(start, end + 1)) as SectorPick[]
  if (!picks.length) throw new Error('板块分析结果为空')
  saveSectorPicks(date, picks)
  BrowserWindow.getAllWindows().forEach((w) =>
    w.webContents.send('scheduler:sector-picks-updated', { date, picks })
  )
}

// ── Hourly insight (整点 09:30-16:00 ET) ─────────────────────────────────────

async function runHourlyInsight() {
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
    const text = await generateOpenRouterText(prompt, { modelRole: 'cheap', search: false })
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

// ── Prefetch AI data for all tracked symbols ──────────────────────────────────

async function runPrefetch() {
  const settings = getPrefetchSettings()
  if (!settings.enabled) return

  const symbols = new Set<string>()

  // 持仓
  for (const h of listHoldings()) {
    if (h.type === 'stock') symbols.add(h.symbol.toUpperCase())
  }

  if (settings.scope === 'holdings_watchlist') {
    for (const group of listWatchGroups()) {
      for (const item of listWatchItems(group.id)) {
        symbols.add(item.symbol.toUpperCase())
      }
    }
  }

  // 涨幅榜 / 跌幅榜（从 quote_cache 读最近缓存）
  // 只在显式开启 holdings_watchlist 时纳入近期榜单，避免后台成本失控。
  if (settings.scope === 'holdings_watchlist') {
    for (const cacheKey of ['screener:day_gainers', 'screener:day_losers']) {
      const cached = cacheGet(cacheKey) as { symbol: string }[] | null
      if (cached) cached.forEach(s => symbols.add(s.symbol.toUpperCase()))
    }

    const picks = getLatestDailyPicks()
    if (picks) picks.picks.forEach(p => symbols.add(p.symbol.toUpperCase()))

    const sectorPicks = getLatestSectorPicks()
    if (sectorPicks) {
      sectorPicks.picks.forEach(sp => sp.stocks.forEach(s => symbols.add(s.symbol.toUpperCase())))
    }
  }

  const symbolList = [...symbols].slice(0, settings.maxSymbolsPerRun)
  if (!symbolList.length) return
  console.log(`[prefetch] Prefetching AI data for ${symbolList.length} symbols: ${symbolList.join(', ')}`)

  const broadcast = (event: string, payload: unknown) =>
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send(event, payload))

  broadcast('prefetch:status', { running: true, total: symbolList.length, done: 0 })
  let doneCount = 0

  // 逐个串行预取，避免并发过多 API 请求
  for (const sym of symbolList) {
    try {
      await prefetchSymbol(sym, undefined, (p) => {
        broadcast('prefetch:progress', p)
      }, { allowSearch: settings.allowSearch })
    } catch (e) {
      console.warn(`[prefetch] ${sym} failed:`, (e as Error).message)
    }
    doneCount++
    broadcast('prefetch:status', { running: true, total: symbolList.length, done: doneCount })
  }

  broadcast('prefetch:status', { running: false, total: symbolList.length, done: doneCount })
  console.log('[prefetch] Done.')
}

// ── Public scheduler API ───────────────────────────────────────────────────────

let started = false
let lastPrefetchAt = 0

export async function startScheduler() {
  if (started) return
  started = true

  // Update tray status every 5 minutes
  updateTrayStatus()
  cron.schedule('*/5 * * * *', updateTrayStatus)

  cron.schedule('0 * * * *', async () => {
    if (!isNYSETradingDay()) return
    const { hour, minute } = nowInET()
    if (hour === 9 && minute === 0) await triggerDailyPicks()
    if (hour >= 9 && hour <= 16 && minute === 0 && hour !== 9) await runHourlyInsight()
  })

  cron.schedule('30 * * * *', async () => {
    if (!isNYSETradingDay()) return
    const { hour, minute } = nowInET()
    if (hour === 9 && minute === 30) await runHourlyInsight()
  })

  // 后台预取默认关闭；开启后仍按设置限量运行。
  cron.schedule('*/10 * * * *', () => {
    const settings = getPrefetchSettings()
    if (!settings.enabled) return
    const intervalMs = settings.intervalMinutes * 60_000
    if (Date.now() - lastPrefetchAt < intervalMs) return
    lastPrefetchAt = Date.now()
    void runPrefetch()
  })

  console.log('[scheduler] Started. Monitoring NYSE trading hours.')
}

export function stopScheduler() {
  cron.getTasks().forEach((task) => task.stop())
  started = false
}
