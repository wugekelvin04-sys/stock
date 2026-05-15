import { useEffect, useRef, useState } from 'react'
import { Activity, CheckCircle, XCircle, SkipForward, Loader2 } from 'lucide-react'

interface ProgressItem {
  symbol: string
  type: string
  status: 'running' | 'done' | 'skip' | 'error'
  ts: number
}

const TYPE_LABEL: Record<string, string> = {
  profile: '公司介绍',
  catalyst: '利好利空',
  ratings: '机构评级',
  earnings: '财报',
}

function StatusIcon({ status }: { status: ProgressItem['status'] }) {
  if (status === 'running') return <Loader2 size={10} className="animate-spin text-accent" />
  if (status === 'done') return <CheckCircle size={10} className="text-accent-up" />
  if (status === 'error') return <XCircle size={10} className="text-accent-down" />
  return <SkipForward size={10} className="text-fg-subtle" />
}

export function PrefetchTaskPanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<{ running: boolean; total: number; done: number } | null>(null)
  const [items, setItems] = useState<ProgressItem[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubStatus = window.api.prefetch.onStatus(s => setStatus(s))
    const unsubProgress = window.api.prefetch.onProgress(p => {
      setItems(prev => {
        const key = `${p.symbol}:${p.type}`
        const existing = prev.findIndex(x => `${x.symbol}:${x.type}` === key)
        const item: ProgressItem = { symbol: p.symbol, type: p.type, status: p.status as ProgressItem['status'], ts: Date.now() }
        if (existing >= 0) {
          const next = [...prev]
          next[existing] = item
          return next
        }
        return [item, ...prev].slice(0, 80)
      })
    })
    return () => { unsubStatus(); unsubProgress() }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const running = items.filter(x => x.status === 'running')
  const recent = items.filter(x => x.status !== 'running').slice(0, 20)

  return (
    <div
      ref={panelRef}
      className="absolute left-14 bottom-16 z-50 w-64 rounded-lg border border-border bg-bg-elevated shadow-xl overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Activity size={12} className={status?.running ? 'text-accent animate-pulse' : 'text-fg-subtle'} />
        <span className="text-xs font-semibold text-fg">后台任务</span>
        {status && (
          <span className="ml-auto text-[10px] text-fg-subtle">
            {status.running ? `${status.done}/${status.total}` : '空闲'}
          </span>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto">
        {running.length > 0 && (
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-medium text-fg-subtle mb-1.5">进行中</p>
            <div className="space-y-1">
              {running.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <StatusIcon status={item.status} />
                  <span className="text-[11px] font-medium text-fg">{item.symbol}</span>
                  <span className="text-[10px] text-fg-subtle">{TYPE_LABEL[item.type] ?? item.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recent.length > 0 ? (
          <div className="px-3 py-2">
            <p className="text-[10px] font-medium text-fg-subtle mb-1.5">最近完成</p>
            <div className="space-y-1">
              {recent.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <StatusIcon status={item.status} />
                  <span className="text-[11px] text-fg-muted">{item.symbol}</span>
                  <span className="text-[10px] text-fg-subtle">{TYPE_LABEL[item.type] ?? item.type}</span>
                  {item.status === 'skip' && <span className="ml-auto text-[9px] text-fg-subtle">已缓存</span>}
                </div>
              ))}
            </div>
          </div>
        ) : running.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] text-fg-subtle">暂无后台任务</p>
        ) : null}
      </div>
    </div>
  )
}
