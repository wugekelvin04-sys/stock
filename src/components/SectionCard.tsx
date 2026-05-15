interface Props {
  title: string
  subtitle?: string
  children: React.ReactNode
  loading?: boolean
  fromCache?: boolean
  fetchedAt?: number
}

function timeAgo(ms: number) {
  const diff = Math.floor((Date.now() - ms) / 60000)
  if (diff < 1) return '刚刚'
  if (diff < 60) return `${diff} 分钟前`
  return `${Math.floor(diff / 60)} 小时前`
}

export function SectionCard({ title, subtitle, children, loading, fromCache, fetchedAt }: Props) {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {subtitle && <p className="text-xs text-fg-subtle">{subtitle}</p>}
        </div>
        {fromCache && fetchedAt && (
          <span className="text-[11px] text-fg-subtle">{timeAgo(fetchedAt)}</span>
        )}
        {loading && <div className="h-3 w-3 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />}
      </div>
      {children}
    </div>
  )
}
