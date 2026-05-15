import { useEffect, useState } from 'react'
import { Brain, Clock } from 'lucide-react'

interface InsightItem {
  id: number
  triggered_at: number
  content: string
}

function timeLabel(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }) + ' ET'
}

export function HourlyInsight() {
  const [insights, setInsights] = useState<InsightItem[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    window.api.insight.list(8).then(setInsights).catch(() => {})

    const unsub = window.api.insight.onInsightUpdated((payload) => {
      setInsights((prev) => [
        { id: Date.now(), triggered_at: Math.floor(payload.triggeredAt / 1000), content: payload.content },
        ...prev.slice(0, 7),
      ])
    })
    return () => { unsub() }
  }, [])

  if (insights.length === 0) return null

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Brain size={14} className="text-accent" />
        <span className="text-sm font-semibold text-fg">今日持仓 Insight</span>
        <span className="text-xs text-fg-subtle">开盘期间每小时更新</span>
      </div>
      <div className="space-y-2">
        {insights.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-border bg-bg p-3 cursor-pointer hover:border-accent/40 transition-colors"
            onClick={() => setExpanded(expanded === item.id ? null : item.id)}
          >
            <div className="flex items-center gap-2 text-xs text-fg-subtle mb-1">
              <Clock size={11} />
              <span>{timeLabel(item.triggered_at)}</span>
            </div>
            <p className={`text-sm text-fg-muted leading-relaxed ${expanded === item.id ? '' : 'line-clamp-2'}`}>
              {item.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
