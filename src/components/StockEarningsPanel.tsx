import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, RefreshCw, Square, ExternalLink, ChevronDown, Calendar } from 'lucide-react'

function cleanText(t: string) {
  return t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim()
}

interface ParsedSource { title: string; url: string }

interface EarningsRow {
  quarter: string
  date: string
  epsEst: string
  epsAct: string
  epsResult: 'beat' | 'miss' | 'meet' | ''
  revEst: string
  revAct: string
  revResult: 'beat' | 'miss' | 'meet' | ''
}

interface NextEarnings {
  date: string
  epsEst: string
  note: string
}

function parseResult(s: string): 'beat' | 'miss' | 'meet' | '' {
  const lower = s.toLowerCase()
  if (/beat/.test(lower)) return 'beat'
  if (/miss/.test(lower)) return 'miss'
  if (/meet|in.line/.test(lower)) return 'meet'
  return ''
}

function parseEarnings(raw: string): { rows: EarningsRow[]; next: NextEarnings | null; sources: ParsedSource[] } {
  const rows: EarningsRow[] = []
  const sources: ParsedSource[] = []
  let next: NextEarnings | null = null

  const normalized = raw.replace(/\]\s*\n\s*\(/g, '](')
  const linkRe = /\[(.+?)\]\((https?:\/\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(normalized)) !== null) {
    sources.push({ title: m[1], url: m[2] })
  }

  const expanded = raw.replace(/(##\s*\S)/g, '\n$1')
  const lines = expanded.split('\n')
  let section: 'none' | 'history' | 'next' | 'src' = 'none'
  const nextLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#+\s*历史财报/.test(trimmed)) { section = 'history'; continue }
    if (/^#+\s*下次财报/.test(trimmed)) { section = 'next'; continue }
    if (/^#+\s*sources/i.test(trimmed) || /^sources[:：]?$/i.test(trimmed)) { section = 'src'; continue }
    if (/^#/.test(trimmed)) { section = 'none'; continue }
    if (section === 'src') continue
    if (trimmed.startsWith('>')) continue
    if (/^\[.+\]\(https?:\/\//.test(trimmed)) continue
    if (/^---+$/.test(trimmed) || /^\|[-:| ]+\|$/.test(trimmed)) continue

    if (section === 'history' && trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map(c => cleanText(c)).filter((_c, i) => i > 0 && i < trimmed.split('|').length - 1)
      if (cells.length >= 6 && !/^季度|^quarter/i.test(cells[0])) {
        rows.push({
          quarter: cells[0],
          date: cells[1],
          epsEst: cells[2],
          epsAct: cells[3],
          epsResult: parseResult(cells[4]),
          revEst: cells[5],
          revAct: cells[6] ?? '',
          revResult: parseResult(cells[7] ?? ''),
        })
      }
    } else if (section === 'next') {
      const t = cleanText(trimmed)
      if (t) nextLines.push(t)
    }
  }

  // 解析下次财报
  if (nextLines.length > 0) {
    const block = nextLines.join('\n')
    const dateM = block.match(/日期[:：]\s*(\S+)/)
    const epsM = block.match(/预期EPS[:：]\s*(\S+)/)
    const noteM = block.match(/说明[:：]\s*(.+)/)
    next = {
      date: dateM?.[1] ?? '',
      epsEst: epsM?.[1] ?? '',
      note: noteM?.[1] ?? nextLines.find(l => !l.match(/^(日期|预期EPS|说明)[:：]/)) ?? '',
    }
  }

  return { rows, next, sources }
}

function ResultBadge({ result }: { result: 'beat' | 'miss' | 'meet' | '' }) {
  if (!result) return null
  if (result === 'beat') return (
    <span className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold bg-accent-up/15 text-accent-up border border-accent-up/25">
      <TrendingUp size={8} />Beat
    </span>
  )
  if (result === 'miss') return (
    <span className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold bg-accent-down/15 text-accent-down border border-accent-down/25">
      <TrendingDown size={8} />Miss
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold bg-bg-subtle text-fg-subtle border border-border">
      <Minus size={8} />Meet
    </span>
  )
}

export function StockEarningsPanel({ symbol }: { symbol: string }) {
  const [rawContent, setRawContent] = useState('')
  const [streaming, setStreaming] = useState(false)
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

    const unsub = window.api.stock.onEarningsChunk((chunk) => {
      if (!activeRef.current) return
      if (mySessionId && chunk.sessionId && chunk.sessionId !== mySessionId) return
      if (chunk.type === 'token' && chunk.text) setRawContent(p => p + chunk.text)
      else if (chunk.type === 'done') setStreaming(false)
      else if (chunk.type === 'error') setStreaming(false)
    })
    unsubRef.current = unsub

    try {
      const { sessionId } = await window.api.stock.earningsGenerate(symbol)
      mySessionId = sessionId
    } catch {
      setStreaming(false)
      unsub()
    }
  }

  useEffect(() => {
    activeRef.current = true
    setRawContent('')
    setStreaming(false)
    setShowSources(false)
    unsubRef.current?.()

    window.api.stock.earningsGet(symbol).then(r => {
      if (!activeRef.current) return
      if (r) setRawContent(r.content)
      else void generate()
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

  const { rows, next, sources } = parseEarnings(rawContent)

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={13} className="text-fg-muted" />
          <span className="text-sm font-semibold text-fg">财报</span>
          {next?.date && !streaming && (
            <span className="text-[10px] text-fg-subtle">
              下次 <span className="font-mono text-accent">{next.date}</span>
            </span>
          )}
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
        <p className="text-xs text-fg-subtle">正在搜索财报数据…<span className="inline-block h-3 w-0.5 animate-pulse bg-fg-muted align-middle ml-0.5" /></p>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-bg-subtle">
                <th className="px-2.5 py-1.5 text-left font-medium text-fg-subtle">季度</th>
                <th className="px-2.5 py-1.5 text-left font-medium text-fg-subtle">日期</th>
                <th className="px-2.5 py-1.5 text-right font-medium text-fg-subtle">EPS预期</th>
                <th className="px-2.5 py-1.5 text-right font-medium text-fg-subtle">EPS实际</th>
                <th className="px-2.5 py-1.5 text-center font-medium text-fg-subtle">EPS</th>
                <th className="px-2.5 py-1.5 text-right font-medium text-fg-subtle">营收预期</th>
                <th className="px-2.5 py-1.5 text-right font-medium text-fg-subtle">营收实际</th>
                <th className="px-2.5 py-1.5 text-center font-medium text-fg-subtle">营收</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-bg-subtle transition-colors">
                  <td className="px-2.5 py-1.5 font-medium text-fg-muted">{r.quarter}</td>
                  <td className="px-2.5 py-1.5 font-mono text-fg-subtle">{r.date}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono text-fg-subtle">{r.epsEst}</td>
                  <td className={`px-2.5 py-1.5 text-right font-mono font-medium ${r.epsResult === 'beat' ? 'text-accent-up' : r.epsResult === 'miss' ? 'text-accent-down' : 'text-fg-muted'}`}>{r.epsAct}</td>
                  <td className="px-2.5 py-1.5 text-center"><ResultBadge result={r.epsResult} /></td>
                  <td className="px-2.5 py-1.5 text-right font-mono text-fg-subtle">{r.revEst}</td>
                  <td className={`px-2.5 py-1.5 text-right font-mono font-medium ${r.revResult === 'beat' ? 'text-accent-up' : r.revResult === 'miss' ? 'text-accent-down' : 'text-fg-muted'}`}>{r.revAct}</td>
                  <td className="px-2.5 py-1.5 text-center"><ResultBadge result={r.revResult} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {next && (
        <div className="rounded-md border border-border bg-bg-subtle px-3 py-2 flex items-start gap-2">
          <Calendar size={11} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <span className="text-[11px] font-semibold text-fg">下次财报</span>
            {next.date && <span className="ml-1.5 font-mono text-[11px] text-accent">{next.date}</span>}
            {next.epsEst && <span className="ml-1.5 text-[10px] text-fg-subtle">预期EPS {next.epsEst}</span>}
            {next.note && <p className="mt-0.5 text-[10px] text-fg-subtle leading-snug">{next.note}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
