import { useEffect, useState } from 'react'

type ClaudeInfo = Awaited<ReturnType<Window['api']['getClaudeInfo']>>
type AppInfo = Awaited<ReturnType<Window['api']['getAppInfo']>>

export default function App() {
  const [pong, setPong] = useState<string>('')
  const [claude, setClaude] = useState<ClaudeInfo | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.api.getClaudeInfo().then(setClaude)
    window.api.getAppInfo().then(setInfo)
  }, [])

  const ping = async () => {
    const r = await window.api.ping(new Date().toISOString())
    setPong(r)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-accent-up" />
          <span className="font-semibold tracking-tight">Stock Desk</span>
          <span className="text-xs text-fg-subtle">v{info?.version ?? '…'}</span>
        </div>
        <div className="text-xs text-fg-muted" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className="kbd">⌘</span> <span className="kbd">⌥</span> <span className="kbd">\</span>
          <span className="ml-2">显示 / 隐藏</span>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="card">
            <h2 className="mb-2 text-sm font-semibold text-fg-muted">M1 脚手架联调</h2>
            <p className="text-sm text-fg-muted">
              当前为开发壳。后续会接入持仓导入、行情、趋势图、AI 分析与每日机会榜。
            </p>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">IPC 通路</h3>
              <button className="btn btn-primary" onClick={ping}>
                发送 ping
              </button>
            </div>
            <code className="block rounded bg-bg px-3 py-2 font-mono text-xs text-fg-muted">
              {pong || '尚未点击 ping'}
            </code>
          </div>

          <div className="card">
            <h3 className="mb-3 text-sm font-semibold">Claude CLI 探测</h3>
            {claude == null ? (
              <p className="text-sm text-fg-muted">检测中…</p>
            ) : claude.ok ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-up" />
                  <span className="text-fg">已就绪</span>
                </div>
                <div className="font-mono text-xs text-fg-muted">version: {claude.version}</div>
                <div className="font-mono text-xs text-fg-muted">path: {claude.path}</div>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-down" />
                  <span className="text-fg">未找到</span>
                </div>
                <p className="text-xs text-fg-muted">{claude.error}</p>
              </div>
            )}
          </div>

          {info && (
            <div className="card">
              <h3 className="mb-3 text-sm font-semibold">运行环境</h3>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs text-fg-muted">
                <div>platform</div><div>{info.platform} / {info.arch}</div>
                <div>node</div><div>{info.node}</div>
                <div>electron</div><div>{info.electron}</div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
