import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

export function ProtectedRoute() {
  const { unlocked, unlock } = useAuthStore()
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  if (unlocked) return <Outlet />

  function handleUnlock() {
    const ok = unlock(input)
    if (!ok) { setError(true); setInput('') }
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="w-72 rounded-xl border border-border bg-bg-elevated shadow-2xl">
        <div className="px-5 pt-5 pb-4">
          <p className="mb-1 text-sm font-semibold text-fg">持仓已加密</p>
          <p className="mb-4 text-[11px] text-fg-subtle">请输入密码以查看持仓信息</p>
          <input
            autoFocus
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false) }}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            className={`input text-sm ${error ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/20' : ''}`}
            placeholder="密码"
          />
          {error && <p className="mt-1.5 text-[11px] text-red-400">密码错误</p>}
        </div>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <button onClick={handleUnlock} className="btn btn-primary text-xs">
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
