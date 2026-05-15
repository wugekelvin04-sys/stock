import { useEffect, useRef } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToastStore, type Toast } from '../stores/toast'

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLORS = {
  success: 'text-accent-up border-accent-up/30 bg-accent-up/10',
  error: 'text-accent-down border-accent-down/30 bg-accent-down/10',
  warning: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  info: 'text-accent border-accent/30 bg-accent/10',
}

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToastStore()
  const Icon = ICONS[toast.type]
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const duration = toast.duration ?? 4000
    if (duration > 0) {
      timerRef.current = setTimeout(() => dismiss(toast.id), duration)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [toast.id, toast.duration, dismiss])

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur-sm ${COLORS[toast.type]} animate-in`}
      style={{ minWidth: 240, maxWidth: 360 }}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        {toast.title && <p className="text-xs font-semibold mb-0.5">{toast.title}</p>}
        <p className="text-xs opacity-90 leading-snug">{toast.message}</p>
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={12} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const { toasts } = useToastStore()
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  )
}
