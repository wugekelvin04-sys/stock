import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap } from 'lucide-react'

// M5 will fill this out with charts + streaming analysis
export function Detail() {
  const { symbol } = useParams<{ symbol: string }>()
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <button
          onClick={() => navigate(-1)}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="btn"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="font-mono text-lg font-bold text-fg">{symbol}</span>
        <div className="flex-1" />
        <button
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="btn btn-primary flex items-center gap-1.5"
          disabled
        >
          <Zap size={13} />
          一键分析 (M5)
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-fg-muted">图表与 AI 分析</p>
          <p className="mt-1 text-xs text-fg-subtle">M5 里程碑实现</p>
        </div>
      </div>
    </div>
  )
}
