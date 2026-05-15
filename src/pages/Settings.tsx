export function Settings() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border px-5 py-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="font-semibold text-fg">设置</span>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="card max-w-md space-y-3">
          <h3 className="text-sm font-semibold text-fg">全局快捷键</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">显示 / 隐藏窗口</span>
            <div className="flex gap-1">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">⌥</kbd>
              <kbd className="kbd">\</kbd>
            </div>
          </div>
          <p className="text-xs text-fg-subtle">M7 阶段支持自定义快捷键</p>
        </div>
      </div>
    </div>
  )
}
