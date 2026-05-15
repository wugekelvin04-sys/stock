import { useEffect, useRef, useState } from 'react'
import { BarChart2, RefreshCw, Square, ExternalLink, ChevronDown } from 'lucide-react'

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function cleanText(t: string) {
  return t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim()
}

interface ParsedSource { title: string; url: string }
interface RatingRow { firm: string; rating: string; target: string; date: string }

function ratingColor(r: string): string {
  const s = r.toLowerCase()
  if (/买入|增持|强烈推荐|outperform|buy|overweight|strong buy/.test(s)) return 'text-accent-up'
  if (/卖出|减持|underperform|sell|underweight/.test(s)) return 'text-accent-down'
  return 'text-fg-muted'
}

function parseRatings(raw: string): { rows: RatingRow[]; summary: string; sources: ParsedSource[] } {
  const rows: RatingRow[] = []
  const sources: ParsedSource[] = []
  let summary = ''

  // Extract all markdown links globally
  const normalized = raw.replace(/\]\s*\n\s*\(/g, '](')
  const linkRe = /\[(.+?)\]\((https?:\/\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(normalized)) !== null) {
    sources.push({ title: m[1], url: m[2] })
  }

  // 把行内 ## 拆成独立行
  const expanded = raw.replace(/(##\s*\S)/g, '\n$1')
  const lines = expanded.split('\n')
  let section: 'none' | 'table' | 'summary' | 'src' = 'none'

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#+\s*机构评级/.test(trimmed)) { section = 'table'; continue }
    if (/^#+\s*综合观点/.test(trimmed)) { section = 'summary'; continue }
    if (/^#+\s*sources/i.test(trimmed) || /^sources[:：]?$/i.test(trimmed)) { section = 'src'; continue }
    if (/^#/.test(trimmed)) { section = 'none'; continue }
    if (section === 'src') continue
    if (/^---+$/.test(trimmed) || /^\|[-:| ]+\|$/.test(trimmed)) continue  // 分隔线 / 表格分隔行
    if (trimmed.startsWith('>')) continue
    if (/^\[.+\]\(https?:\/\//.test(trimmed)) continue

    if (section === 'table' && trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map(c => cleanText(c)).filter((_c, i) => i > 0 && i < trimmed.split('|').length - 1)
      if (cells.length >= 3 && !/^机构|^firm/i.test(cells[0])) {
        const firm = cells[0]
        // 每家机构只保留最新（第一条）
        if (!rows.some(r => r.firm === firm)) {
          rows.push({ firm, rating: cells[1], target: cells[2] ?? '', date: cells[3] ?? '' })
        }
      }
    } else if (section === 'summary') {
      const t = cleanText(trimmed)
      if (t) summary += (summary ? ' ' : '') + t
    }
  }

  return { rows, summary, sources }
}

export function StockRatingsPanel({ symbol }: { symbol: string }) {
  const [rawContent, setRawContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [date, setDate] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(true)

  const generate = async () => {
    setStreaming(true)
    setRawContent('')
    setShowSources(false)
    unsubRef.current?.()

    let mySessionId: string | null = null

    const unsub = window.api.stock.onRatingsChunk((chunk) => {
      if (!activeRef.current) return
      if (mySessionId && chunk.sessionId && chunk.sessionId !== mySessionId) return
      if (chunk.type === 'token' && chunk.text) setRawContent(p => p + chunk.text)
      else if (chunk.type === 'done') { setStreaming(false); setDate(todayET()) }
      else if (chunk.type === 'error') setStreaming(false)
    })
    unsubRef.current = unsub

    try {
      const { sessionId } = await window.api.stock.ratingsGenerate(symbol)
      mySessionId = sessionId
    } catch {
      setStreaming(false)
      unsub()
    }
  }

  useEffect(() => {
    activeRef.current = true
    setRawContent('')
    setDate(null)
    setStreaming(false)
    setShowSources(false)
    unsubRef.current?.()

    window.api.stock.ratingsGet(symbol).then(r => {
      if (!activeRef.current) return
      if (r && r.date === todayET()) {
        setRawContent(r.content)
        setDate(r.date)
      } else {
        void generate()
      }
    })

    return () => {
      activeRef.current = false
      unsubRef.current?.()
    }
  }, [symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showSources) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowSources(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSources])

  const { rows, summary, sources } = parseRatings(rawContent)

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={13} className="text-fg-muted" />
          <span className="text-sm font-semibold text-fg">机构评级</span>
          {date && !streaming && <span className="text-[10px] text-fg-subtle">{date}</span>}
          {streaming && <span className="flex items-center gap-1 text-xs text-fg-subtle"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />搜索中…</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {sources.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setShowSources(p => !p)} className="btn flex items-center gap-1 text-xs py-0.5">
                来源 <ChevronDown size={10} className={`transition-transform ${showSources ? 'rotate-180' : ''}`} />
              </button>
              {showSources && (
                <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-bg-elevated shadow-xl">
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                    {sources.map((s, i) => (
                      <button key={i} onClick={() => window.api.openExternal(s.url)}
                        className="flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-bg-subtle transition-colors">
                        <ExternalLink size={10} className="mt-0.5 shrink-0 text-fg-subtle" />
                        <span className="text-[11px] text-fg-muted leading-snug line-clamp-2">{s.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {streaming
            ? <button onClick={() => { unsubRef.current?.(); setStreaming(false) }} className="btn flex items-center gap-1 text-xs py-0.5"><Square size={10} />停止</button>
            : <button onClick={generate} className="btn flex items-center gap-1 text-xs py-0.5"><RefreshCw size={10} />刷新</button>
          }
        </div>
      </div>

      {streaming && !rawContent && (
        <p className="text-xs text-fg-subtle">正在搜索机构评级数据…<span className="inline-block h-3 w-0.5 animate-pulse bg-fg-muted align-middle ml-0.5" /></p>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-bg-subtle">
                <th className="px-2.5 py-1.5 text-left font-medium text-fg-subtle">机构</th>
                <th className="px-2.5 py-1.5 text-left font-medium text-fg-subtle">评级</th>
                <th className="px-2.5 py-1.5 text-right font-medium text-fg-subtle">目标价</th>
                <th className="px-2.5 py-1.5 text-right font-medium text-fg-subtle">日期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-bg-subtle transition-colors">
                  <td className="px-2.5 py-1.5 text-fg-muted">{r.firm}</td>
                  <td className={`px-2.5 py-1.5 font-medium ${ratingColor(r.rating)}`}>{r.rating}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono text-fg-muted">{r.target || '—'}</td>
                  <td className={`px-2.5 py-1.5 text-right font-mono ${/^\d{4}-\d{2}-\d{2}$/.test(r.date) ? 'text-fg-subtle' : 'text-fg-subtle/50'}`}>
                    {r.date || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && (
        <p className="text-[11px] text-fg-muted leading-relaxed">{summary}</p>
      )}
    </div>
  )
}
