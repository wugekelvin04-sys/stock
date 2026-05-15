import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { OptionContract, CachedResult } from '../../electron/services/market'

interface Props {
  symbol: string
  currentPrice?: number
}

function fmtOI(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function fmtIV(iv: number): string {
  return `${(iv * 100).toFixed(0)}%`
}

interface StrikeRow {
  strike: number
  call?: OptionContract
  put?: OptionContract
}

export function OptionsChain({ symbol, currentPrice }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [contracts, setContracts] = useState<OptionContract[]>([])
  const [datesLoading, setDatesLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const datesScrollRef = useRef<HTMLDivElement>(null)

  // Load option dates when expanded
  useEffect(() => {
    if (!expanded || dates.length > 0) return
    setDatesLoading(true)
    setError(null)
    ;(window.api.market.optionDates(symbol) as Promise<string[]>)
      .then((d) => {
        setDates(d)
        if (d.length > 0) setSelectedDate(d[0])
      })
      .catch(() => {
        setError('获取失败，请稍后重试')
      })
      .finally(() => setDatesLoading(false))
  }, [expanded, symbol, dates.length])

  // Load contracts when date changes
  useEffect(() => {
    if (!selectedDate) return
    setLoading(true)
    setError(null)
    ;(window.api.market.optionsByDate(symbol, selectedDate) as Promise<CachedResult<OptionContract[]>>)
      .then((res) => {
        setContracts(res.data ?? [])
      })
      .catch(() => {
        setError('获取失败，请稍后重试')
      })
      .finally(() => setLoading(false))
  }, [symbol, selectedDate])

  // Build strike rows
  const strikeRows: StrikeRow[] = (() => {
    const map = new Map<number, StrikeRow>()
    for (const c of contracts) {
      const row = map.get(c.strike) ?? { strike: c.strike }
      if (c.type === 'call') row.call = c
      else row.put = c
      map.set(c.strike, row)
    }
    return Array.from(map.values()).sort((a, b) => a.strike - b.strike)
  })()

  // ATM strike index
  const atmStrike = currentPrice
    ? strikeRows.reduce<number | null>((best, row) => {
        if (best === null) return row.strike
        return Math.abs(row.strike - currentPrice) < Math.abs(best - currentPrice)
          ? row.strike
          : best
      }, null)
    : null

  return (
    <div className="card">
      <button
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded((v) => !v)}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">期权链</h3>
        {expanded ? (
          <ChevronDown size={14} className="text-fg-subtle" />
        ) : (
          <ChevronRight size={14} className="text-fg-subtle" />
        )}
      </button>

      {expanded && (
        <div className="mt-3">
          {/* Date tabs */}
          {datesLoading && (
            <div className="flex items-center justify-center py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />
            </div>
          )}

          {!datesLoading && error && (
            <p className="py-4 text-center text-xs text-fg-subtle">{error}</p>
          )}

          {!datesLoading && !error && dates.length === 0 && (
            <p className="py-4 text-center text-xs text-fg-subtle">暂无期权数据</p>
          )}

          {!datesLoading && dates.length > 0 && (
            <>
              {/* Scrollable date tabs */}
              <div
                ref={datesScrollRef}
                className="flex gap-1 overflow-x-auto pb-2 scrollbar-none"
                style={{ scrollbarWidth: 'none' }}
              >
                {dates.slice(0, 8).map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      selectedDate === d
                        ? 'bg-accent/15 text-accent'
                        : 'text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted'
                    }`}
                  >
                    {d}
                  </button>
                ))}
                {dates.length > 8 && (
                  <>
                    {dates.slice(8).map((d) => (
                      <button
                        key={d}
                        onClick={() => setSelectedDate(d)}
                        className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                          selectedDate === d
                            ? 'bg-accent/15 text-accent'
                            : 'text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Table */}
              {loading && (
                <div className="flex items-center justify-center py-6">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />
                </div>
              )}

              {!loading && strikeRows.length === 0 && (
                <p className="py-4 text-center text-xs text-fg-subtle">暂无期权数据</p>
              )}

              {!loading && strikeRows.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {/* Call header */}
                        <th className="pb-1.5 pl-0 pr-2 text-left font-medium text-accent-up">Last</th>
                        <th className="pb-1.5 px-2 text-left font-medium text-accent-up">IV</th>
                        <th className="pb-1.5 px-2 text-left font-medium text-accent-up">OI</th>
                        {/* Strike */}
                        <th className="pb-1.5 px-3 text-center font-semibold text-fg-muted">Strike</th>
                        {/* Put header */}
                        <th className="pb-1.5 px-2 text-right font-medium text-accent-down">Last</th>
                        <th className="pb-1.5 px-2 text-right font-medium text-accent-down">IV</th>
                        <th className="pb-1.5 pl-2 pr-0 text-right font-medium text-accent-down">OI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strikeRows.map((row) => {
                        const isAtm = atmStrike !== null && row.strike === atmStrike
                        return (
                          <tr
                            key={row.strike}
                            className={`border-b border-border/50 ${isAtm ? 'bg-accent/5' : ''}`}
                          >
                            {/* Call side */}
                            <td className="py-1 pl-0 pr-2 font-mono text-accent-up">
                              {row.call ? row.call.lastPrice.toFixed(2) : '—'}
                            </td>
                            <td className="py-1 px-2 text-fg-muted">
                              {row.call ? fmtIV(row.call.impliedVolatility) : '—'}
                            </td>
                            <td className="py-1 px-2 text-fg-muted">
                              {row.call ? fmtOI(row.call.openInterest) : '—'}
                            </td>
                            {/* Strike */}
                            <td className={`py-1 px-3 text-center font-mono font-semibold ${isAtm ? 'text-accent' : 'text-fg'}`}>
                              {isAtm && <span className="mr-1 text-accent">◆</span>}
                              {row.strike}
                            </td>
                            {/* Put side */}
                            <td className="py-1 px-2 text-right font-mono text-accent-down">
                              {row.put ? row.put.lastPrice.toFixed(2) : '—'}
                            </td>
                            <td className="py-1 px-2 text-right text-fg-muted">
                              {row.put ? fmtIV(row.put.impliedVolatility) : '—'}
                            </td>
                            <td className="py-1 pl-2 pr-0 text-right text-fg-muted">
                              {row.put ? fmtOI(row.put.openInterest) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
