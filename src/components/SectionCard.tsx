import { RefreshCw } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  children: React.ReactNode
  loading?: boolean
  fromCache?: boolean
  fetchedAt?: number
  onRefresh?: () => void
  refreshing?: boolean
  headerRight?: React.ReactNode
}

function timeAgo(ms: number) {
  const diff = Math.floor((Date.now() - ms) / 60000)
  if (diff < 1) return '刚刚'
  if (diff < 60) return `${diff} 分钟前`
  return `${Math.floor(diff / 60)} 小时前`
}

export function SectionCard({ title, subtitle, children, loading, fromCache, fetchedAt, onRefresh, refreshing, headerRight }: Props) {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {subtitle && <p className="text-xs text-fg-subtle">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {fromCache && fetchedAt && (
            <span className="text-[11px] text-fg-subtle">{timeAgo(fetchedAt)}</span>
          )}
          {onRefresh && (
            <button onClick={onRefresh} disabled={refreshing} className="rounded p-1 text-fg-subtle hover:text-fg-muted transition-colors">
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
          {loading && <div className="h-3 w-3 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />}
          {headerRight}
        </div>
      </div>
      {children}
    </div>
  )
}
