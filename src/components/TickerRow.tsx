import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { MiniSparkline } from './MiniSparkline'

interface Props {
  rank: number
  symbol: string
  name: string
  price: number
  changePercent: number
  volume?: number
  reason?: string
  sparkPrices?: number[]
  compact?: boolean
}

function fmt(n: number, digits = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtVol(n: number) {
  if (n >= 1e9) return `${fmt(n / 1e9, 1)}B`
  if (n >= 1e6) return `${fmt(n / 1e6, 1)}M`
  if (n >= 1e3) return `${fmt(n / 1e3, 0)}K`
  return String(n)
}

export function TickerRow({ rank, symbol, name, price, changePercent, volume, reason, sparkPrices, compact }: Props) {
  const navigate = useNavigate()
  const up = changePercent >= 0

  if (compact) {
    return (
      <div
        onClick={() => navigate(`/detail/${symbol}`)}
        className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-bg-subtle"
      >
        <span className="w-4 text-center text-xs font-mono text-fg-subtle">{rank}</span>
        <span className="flex-1 font-mono text-xs font-semibold text-fg">{symbol}</span>
        {sparkPrices && sparkPrices.length > 1 && (
          <MiniSparkline prices={sparkPrices} up={up} />
        )}
        <span className="font-mono text-xs text-fg">${fmt(price)}</span>
        <span className={`w-14 text-right text-xs font-medium ${up ? 'text-accent-up' : 'text-accent-down'}`}>
          {up ? '+' : ''}{fmt(changePercent)}%
        </span>
      </div>
    )
  }

  return (
    <div
      onClick={() => navigate(`/detail/${symbol}`)}
      className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-bg-subtle"
    >
      <span className="w-5 text-center text-xs font-mono text-fg-subtle">{rank}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-fg">{symbol}</span>
          <span className="truncate text-xs text-fg-muted">{name}</span>
        </div>
        {reason && <p className="mt-0.5 truncate text-xs text-fg-subtle">{reason}</p>}
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <span className="font-mono text-sm text-fg">${fmt(price)}</span>
        <div className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-accent-up' : 'text-accent-down'}`}>
          {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {up ? '+' : ''}{fmt(changePercent)}%
        </div>
      </div>

      {sparkPrices && sparkPrices.length > 1 && (
        <MiniSparkline prices={sparkPrices} up={changePercent >= 0} />
      )}

      {volume !== undefined && (
        <span className="w-14 text-right text-xs text-fg-subtle">{fmtVol(volume)}</span>
      )}
    </div>
  )
}
