import { ipcMain, BrowserWindow } from 'electron'
import { getStockProfile, saveStockProfile, getStockCatalyst, saveStockCatalyst, getStockRatings, saveStockRatings, getStockEarnings, saveStockEarnings } from '../services/db'
import type { StockProfile, StockCatalyst, StockRatings, StockEarnings } from '../services/db'
import { streamOpenRouterText } from '../services/ai/openrouter'

const PROFILE_PROMPT = (symbol: string) =>
  `用 WebSearch 搜索 ${symbol} 公司基本信息。搜索完成后，直接输出以下格式，除此之外不要输出任何文字（不要说"我来搜索"，不要说"以下是"，不要输出 Sources，不要输出链接，不要输出任何解释）：

## 公司简介
一句话说清楚这家公司是做什么的。

## 主营业务
- 业务1（15字以内）
- 业务2
- 业务3
- 业务4（最多4条）

## 所属行业
一行，例：消费电子 / 智能手机 / 软件生态

## 主要标签
标签1, 标签2, 标签3, 标签4, 标签5, 标签6

只输出这四个 section 的内容，其余一个字都不要输出。`

const CATALYST_PROMPT = (symbol: string) =>
  `用 WebSearch 搜索 ${symbol} 最新新闻，然后输出以下内容：

## 近期利好
- [强][05-12] 利好描述（25字以内）
- [中][05-08] 利好描述
- [弱][04] 利好描述（只知道月份时用单月格式）

## 近期利空
- [强][05-12] 利空描述（25字以内）
- [中][05-08] 利空描述
- [弱][04] 利空描述

规则：
- 每条必须有影响度标记 [强]、[中] 或 [弱]
- 每条必须有日期标记：知道具体日期用 [MM-DD]，只知道月份用 [MM]，都不知道用 [?]
- 共 5-10 条利好，5-10 条利空

## Sources
[来源标题](url)

不要输出除以上三个 section 之外的任何文字。`

const EARNINGS_PROMPT = (symbol: string) =>
  `用 WebSearch 搜索 ${symbol} 最近财报历史和下次财报日期，然后严格按以下格式输出：

## 历史财报
| 季度 | 日期 | EPS预期 | EPS实际 | 结果 | 营收预期 | 营收实际 | 结果 |
|------|------|---------|---------|------|---------|---------|------|
| 2025Q3 | YYYY-MM-DD | $x.xx | $x.xx | Beat/Miss/Meet | $xxB | $xxB | Beat/Miss/Meet |
（列出最近3次，按时间倒序）

## 下次财报
日期: YYYY-MM-DD
预期EPS: $x.xx
说明: 一句话（如"预计2026Q2财报，分析师预期..."）

## Sources
[来源标题](url)

不要输出除以上三个 section 之外的任何文字。`

const RATINGS_PROMPT = (symbol: string) =>
  `用 WebSearch 搜索 ${symbol} 最新机构评级和目标价，然后输出以下内容：

## 机构评级
| 机构 | 评级 | 目标价 | 日期 |
|------|------|--------|------|
| 机构名称 | 买入/持有/卖出/增持/减持 | $xxx | YYYY-MM-DD |

规则：
- 每家机构只列最新一条评级，不要重复同一机构
- 日期必须是完整的 YYYY-MM-DD 格式，不知道具体日期就写最近的月份第一天
- 按日期倒序，列出8-12家不同机构
- 目标价没有就写 —

## 综合观点
2-3句话总结当前机构整体看法和主要分歧点。

## Sources
[来源标题](url)
...

不要输出除以上三个 section 之外的任何文字。`

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

// 防止同一 symbol 并发重复生成（主要应对 React StrictMode 的 double-invoke）
const inFlight = new Map<string, string>()
const activeControllers = new Map<string, AbortController>()

function guard(key: string, sessionId: string): boolean {
  if (inFlight.has(key)) return false
  inFlight.set(key, sessionId)
  return true
}

function runApiStream({
  key,
  sessionId,
  prompt,
  modelRole,
  search,
  onToken,
  onDone,
  onError,
}: {
  key: string
  sessionId: string
  prompt: string
  modelRole: 'search' | 'cheap'
  search: boolean
  onToken: (text: string) => void
  onDone: () => void
  onError: (err: string) => void
}) {
  const controller = new AbortController()
  activeControllers.set(sessionId, controller)
  void streamOpenRouterText(prompt, {
    modelRole,
    search,
    signal: controller.signal,
    onToken,
  }).then(() => {
    inFlight.delete(key)
    activeControllers.delete(sessionId)
    onDone()
  }).catch((err: Error) => {
    inFlight.delete(key)
    activeControllers.delete(sessionId)
    if (controller.signal.aborted) onDone()
    else onError(err.message)
  })
}

export function registerStockHandlers() {
  // Get cached profile (null if not generated yet)
  ipcMain.handle('stock:profile:get', (_e, symbol: string): StockProfile | null => {
    return getStockProfile(symbol)
  })

  // Generate profile via API (streaming), save when done
  ipcMain.handle('stock:profile:generate', async (_e, symbol: string): Promise<{ sessionId: string }> => {
    const key = `profile:${symbol}`
    const sessionId = `profile-${symbol}-${Date.now()}`
    if (!guard(key, sessionId)) return { sessionId: inFlight.get(key)! }

    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { inFlight.delete(key); throw new Error('no window') }

    let accumulated = ''

    runApiStream({
      key,
      prompt: PROFILE_PROMPT(symbol),
      sessionId,
      modelRole: 'cheap',
      search: false,
      onToken: (text) => {
        accumulated += text
        win.webContents.send('stock:profile:chunk', { sessionId, type: 'token', text })
      },
      onDone: () => {
        inFlight.delete(key)
        const tagsMatch = accumulated.match(/##\s*主要标签\s*\n([^\n]+)/)
        const tags = tagsMatch
          ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean)
          : []
        saveStockProfile(symbol, accumulated, tags)
        win.webContents.send('stock:profile:chunk', { sessionId, type: 'done' })
      },
      onError: (err) => {
        win.webContents.send('stock:profile:chunk', { sessionId, type: 'error', error: err })
      },
    })

    return { sessionId }
  })

  // Get cached catalyst for today
  ipcMain.handle('stock:catalyst:get', (_e, symbol: string): StockCatalyst | null => {
    return getStockCatalyst(symbol, todayET())
  })

  // Generate catalyst via API (streaming), save when done
  ipcMain.handle('stock:catalyst:generate', async (_e, symbol: string): Promise<{ sessionId: string }> => {
    const key = `catalyst:${symbol}`
    const sessionId = `catalyst-${symbol}-${Date.now()}`
    if (!guard(key, sessionId)) return { sessionId: inFlight.get(key)! }

    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { inFlight.delete(key); throw new Error('no window') }

    let accumulated = ''
    const date = todayET()

    runApiStream({
      key,
      prompt: CATALYST_PROMPT(symbol),
      sessionId,
      modelRole: 'search',
      search: true,
      onToken: (text) => {
        accumulated += text
        win.webContents.send('stock:catalyst:chunk', { sessionId, type: 'token', text })
      },
      onDone: () => {
        saveStockCatalyst(symbol, date, accumulated)
        win.webContents.send('stock:catalyst:chunk', { sessionId, type: 'done' })
      },
      onError: (err) => {
        win.webContents.send('stock:catalyst:chunk', { sessionId, type: 'error', error: err })
      },
    })

    return { sessionId }
  })

  ipcMain.handle('stock:catalyst:cancel', () => ({ ok: true }))

  // ── Earnings ──────────────────────────────────────────────────────────────
  ipcMain.handle('stock:earnings:get', (_e, symbol: string): StockEarnings | null => {
    const r = getStockEarnings(symbol)
    if (!r) return null
    // 下次财报日期之前不需要刷新（日期未到则缓存有效）
    const today = todayET()
    if (r.nextEarningsDate && r.nextEarningsDate > today) return r
    // 下次财报日期已过，返回 null 触发重新生成
    return null
  })

  ipcMain.handle('stock:earnings:generate', async (_e, symbol: string): Promise<{ sessionId: string }> => {
    const key = `earnings:${symbol}`
    const sessionId = `earnings-${symbol}-${Date.now()}`
    if (!guard(key, sessionId)) return { sessionId: inFlight.get(key)! }

    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { inFlight.delete(key); throw new Error('no window') }

    let accumulated = ''

    runApiStream({
      key,
      prompt: EARNINGS_PROMPT(symbol),
      sessionId,
      modelRole: 'search',
      search: true,
      onToken: (text) => {
        accumulated += text
        win.webContents.send('stock:earnings:chunk', { sessionId, type: 'token', text })
      },
      onDone: () => {
        // 解析下次财报日期用于缓存过期判断
        const dateMatch = accumulated.match(/日期[:：]\s*(\d{4}-\d{2}-\d{2})/)
        const nextDate = dateMatch ? dateMatch[1] : '9999-12-31'
        saveStockEarnings(symbol, accumulated, nextDate)
        win.webContents.send('stock:earnings:chunk', { sessionId, type: 'done' })
      },
      onError: (err) => {
        win.webContents.send('stock:earnings:chunk', { sessionId, type: 'error', error: err })
      },
    })

    return { sessionId }
  })

  // Get cached ratings for today
  ipcMain.handle('stock:ratings:get', (_e, symbol: string): StockRatings | null => {
    return getStockRatings(symbol, todayET())
  })

  // Generate ratings via API (streaming), save when done
  ipcMain.handle('stock:ratings:generate', async (_e, symbol: string): Promise<{ sessionId: string }> => {
    const key = `ratings:${symbol}`
    const existing = inFlight.get(key)
    if (existing) return { sessionId: existing }

    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('no window')

    const sessionId = `ratings-${symbol}-${Date.now()}`
    if (!guard(key, sessionId)) return { sessionId: inFlight.get(key)! }
    let accumulated = ''
    const date = todayET()

    runApiStream({
      key,
      prompt: RATINGS_PROMPT(symbol),
      sessionId,
      modelRole: 'search',
      search: true,
      onToken: (text) => {
        accumulated += text
        win.webContents.send('stock:ratings:chunk', { sessionId, type: 'token', text })
      },
      onDone: () => {
        saveStockRatings(symbol, date, accumulated)
        win.webContents.send('stock:ratings:chunk', { sessionId, type: 'done' })
      },
      onError: (err) => {
        win.webContents.send('stock:ratings:chunk', { sessionId, type: 'error', error: err })
      },
    })

    return { sessionId }
  })
}

// ── Silent prefetch (called by scheduler) ────────────────────────────────────

type PrefetchType = 'profile' | 'catalyst' | 'ratings' | 'earnings'

export interface PrefetchProgress {
  symbol: string
  type: PrefetchType
  status: 'running' | 'done' | 'skip' | 'error'
}

/** 静默预取：缺什么生成什么，不推送 chunk 到前端（数据直接存 DB） */
export async function prefetchSymbol(
  symbol: string,
  types: PrefetchType[] = ['profile', 'catalyst', 'ratings', 'earnings'],
  onProgress?: (p: PrefetchProgress) => void,
  opts: { allowSearch?: boolean } = {},
): Promise<void> {
  const today = todayET()
  const sym = symbol.toUpperCase()
  const allowSearch = opts.allowSearch ?? false

  const report = (type: PrefetchType, status: PrefetchProgress['status']) =>
    onProgress?.({ symbol: sym, type, status })

  for (const type of types) {
    await new Promise<void>((resolve) => {
      if (type === 'profile') {
        if (getStockProfile(sym)) { report(type, 'skip'); return resolve() }
        const key = `profile:${sym}`
        const sessionId = `profile-${sym}-${Date.now()}`
        if (!guard(key, sessionId)) { report(type, 'skip'); return resolve() }
        report(type, 'running')
        let acc = ''
        runApiStream({
          key, prompt: PROFILE_PROMPT(sym), sessionId, modelRole: 'cheap', search: false,
          onToken: t => { acc += t },
          onDone: () => {
            const tagsMatch = acc.match(/##\s*主要标签\s*\n([^\n]+)/)
            const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean) : []
            saveStockProfile(sym, acc, tags)
            report(type, 'done'); resolve()
          },
          onError: () => { report(type, 'error'); resolve() },
        })
      } else if (type === 'catalyst') {
        if (getStockCatalyst(sym, today)) { report(type, 'skip'); return resolve() }
        if (!allowSearch) { report(type, 'skip'); return resolve() }
        const key = `catalyst:${sym}`
        const sessionId = `catalyst-${sym}-${Date.now()}`
        if (!guard(key, sessionId)) { report(type, 'skip'); return resolve() }
        report(type, 'running')
        let acc = ''
        runApiStream({
          key, prompt: CATALYST_PROMPT(sym), sessionId, modelRole: 'search', search: true,
          onToken: t => { acc += t },
          onDone: () => { saveStockCatalyst(sym, today, acc); report(type, 'done'); resolve() },
          onError: () => { report(type, 'error'); resolve() },
        })
      } else if (type === 'ratings') {
        if (getStockRatings(sym, today)) { report(type, 'skip'); return resolve() }
        if (!allowSearch) { report(type, 'skip'); return resolve() }
        const key = `ratings:${sym}`
        const sessionId = `ratings-${sym}-${Date.now()}`
        if (!guard(key, sessionId)) { report(type, 'skip'); return resolve() }
        report(type, 'running')
        let acc = ''
        runApiStream({
          key, prompt: RATINGS_PROMPT(sym), sessionId, modelRole: 'search', search: true,
          onToken: t => { acc += t },
          onDone: () => { saveStockRatings(sym, today, acc); report(type, 'done'); resolve() },
          onError: () => { report(type, 'error'); resolve() },
        })
      } else if (type === 'earnings') {
        const existing = getStockEarnings(sym)
        if (existing && existing.nextEarningsDate > today) { report(type, 'skip'); return resolve() }
        if (!allowSearch) { report(type, 'skip'); return resolve() }
        const key = `earnings:${sym}`
        const sessionId = `earnings-${sym}-${Date.now()}`
        if (!guard(key, sessionId)) { report(type, 'skip'); return resolve() }
        report(type, 'running')
        let acc = ''
        runApiStream({
          key, prompt: EARNINGS_PROMPT(sym), sessionId, modelRole: 'search', search: true,
          onToken: t => { acc += t },
          onDone: () => {
            const dateMatch = acc.match(/日期[:：]\s*(\d{4}-\d{2}-\d{2})/)
            const nextDate = dateMatch ? dateMatch[1] : '9999-12-31'
            saveStockEarnings(sym, acc, nextDate)
            report(type, 'done'); resolve()
          },
          onError: () => { report(type, 'error'); resolve() },
        })
      }
    })
  }
}
