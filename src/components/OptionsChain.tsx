import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { OptionContract, CachedResult } from '../../electron/services/market'

interface Props {
  symbol: string
  currentPrice?: number
}

function fmtVol(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return String(n)
}

function fmtIV(iv: number): string {
  if (iv <= 0) return '—'
  return `${(iv * 100).toFixed(0)}%`
}

type Side = 'call' | 'put'

export function OptionsChain({ symbol, currentPrice }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [contracts, setContracts] = useState<OptionContract[]>([])
  const [datesLoading, setDatesLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [side, setSide] = useState<Side>('call')
  const datesScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!expanded || dates.length > 0) return
    setDatesLoading(true)
    setError(null)
    ;(window.api.market.optionDates(symbol) as Promise<string[]>)
      .then((d) => {
        setDates(d)
        if (d.length > 0) setSelectedDate(d[0])
      })
      .catch(() => setError('获取失败，请稍后重试'))
      .finally(() => setDatesLoading(false))
  }, [expanded, symbol, dates.length])

  useEffect(() => {
    if (!selectedDate) return
    setLoading(true)
    setError(null)
    ;(window.api.market.optionsByDate(symbol, selectedDate) as Promise<CachedResult<OptionContract[]>>)
      .then((res) => setContracts(res.data ?? []))
      .catch(() => setError('获取失败，请稍后重试'))
      .finally(() => setLoading(false))
  }, [symbol, selectedDate])

  const rows = contracts
    .filter((c) => c.type === side)
    .sort((a, b) => b.strike - a.strike)

  const atmStrike = currentPrice
    ? rows.reduce<number | null>((best, r) => {
        if (best === null) return r.strike
        return Math.abs(r.strike - currentPrice) < Math.abs(best - currentPrice) ? r.strike : best
      }, null)
    : null

  return (
    <div className="card">
      <button
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded((v) => !v)}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">期权链</h3>
        {expanded ? <ChevronDown size={14} className="text-fg-subtle" /> : <ChevronRight size={14} className="text-fg-subtle" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {datesLoading && (
            <div className="flex items-center justify-center py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />
            </div>
          )}
          {!datesLoading && error && <p className="py-4 text-center text-xs text-fg-subtle">{error}</p>}
          {!datesLoading && !error && dates.length === 0 && <p className="py-4 text-center text-xs text-fg-subtle">暂无期权数据</p>}

          {!datesLoading && dates.length > 0 && (
            <>
              {/* Expiry date tabs */}
              <div
                ref={datesScrollRef}
                className="flex gap-1 overflow-x-auto pb-1"
                style={{ scrollbarWidth: 'none' }}
              >
                {dates.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      selectedDate === d ? 'bg-accent/15 text-accent' : 'text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted'
                    }`}
                  >
                    {d.slice(5)} {/* MM-DD */}
                  </button>
                ))}
              </div>

              {/* Call / Put toggle */}
              <div className="flex gap-1 rounded-lg bg-bg p-0.5 w-fit">
                <button
                  onClick={() => setSide('call')}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                    side === 'call' ? 'bg-accent-up/15 text-accent-up' : 'text-fg-subtle hover:text-fg-muted'
                  }`}
                >
                  Call 看涨
                </button>
                <button
                  onClick={() => setSide('put')}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                    side === 'put' ? 'bg-accent-down/15 text-accent-down' : 'text-fg-subtle hover:text-fg-muted'
                  }`}
                >
                  Put 看跌
                </button>
              </div>

              {loading && (
                <div className="flex items-center justify-center py-6">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />
                </div>
              )}

              {!loading && rows.length === 0 && <p className="py-4 text-center text-xs text-fg-subtle">暂无数据</p>}

              {!loading && rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-fg-subtle">
                        <th className="pb-1.5 text-left font-medium">行权价</th>
                        <th className="pb-1.5 text-right font-medium">最新价</th>
                        <th className="pb-1.5 text-right font-medium">今日量</th>
                        <th className="pb-1.5 text-right font-medium">隐含波动率</th>
                        <th className="pb-1.5 text-right font-medium">持仓量</th>
                        <th className="pb-1.5 text-right font-medium">实/虚值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => {
                        const isAtm = atmStrike !== null && c.strike === atmStrike
                        const itm = c.inTheMoney
                        return (
                          <tr
                            key={c.contractSymbol}
                            className={`border-b border-border/40 transition-colors hover:bg-bg-subtle ${isAtm ? 'bg-accent/5' : ''}`}
                          >
                            <td className={`py-1.5 font-mono font-semibold ${isAtm ? 'text-accent' : 'text-fg'}`}>
                              {isAtm && <span className="mr-1 text-accent text-[10px]">ATM</span>}
                              ${c.strike}
                            </td>
                            <td className={`py-1.5 text-right font-mono ${side === 'call' ? 'text-accent-up' : 'text-accent-down'}`}>
                              {c.lastPrice > 0 ? `$${c.lastPrice.toFixed(2)}` : '—'}
                            </td>
                            <td className="py-1.5 text-right font-mono text-fg">
                              {c.volume > 0 ? fmtVol(c.volume) : '—'}
                            </td>
                            <td className="py-1.5 text-right font-mono text-fg-muted">
                              {fmtIV(c.impliedVolatility)}
                            </td>
                            <td className="py-1.5 text-right font-mono text-fg-muted">
                              {c.openInterest > 0 ? fmtVol(c.openInterest) : '—'}
                            </td>
                            <td className="py-1.5 text-right">
                              {itm
                                ? <span className="rounded px-1 py-0.5 text-[10px] bg-accent-up/10 text-accent-up">实值</span>
                                : <span className="rounded px-1 py-0.5 text-[10px] bg-bg-subtle text-fg-subtle">虚值</span>
                              }
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
