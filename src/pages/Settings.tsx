import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, RefreshCw, Keyboard, Info, Clock } from 'lucide-react'

interface ClaudeInfo { ok: boolean; version?: string; path?: string; error?: string }
interface AppInfo { version: string; platform: string; arch: string; node: string; electron: string }

export function Settings() {
  const [claude, setClaude] = useState<ClaudeInfo | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [checking, setChecking] = useState(false)

  const checkClaude = async () => {
    setChecking(true)
    try {
      const info = await window.api.getClaudeInfo()
      setClaude(info)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void checkClaude()
    window.api.getAppInfo().then(setAppInfo).catch(() => {})
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header
        className="border-b border-border px-5 py-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="font-semibold text-fg">设置</span>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 快捷键 */}
        <div className="card max-w-lg">
          <div className="mb-3 flex items-center gap-2">
            <Keyboard size={14} className="text-accent" />
            <h3 className="text-sm font-semibold text-fg">快捷键</h3>
          </div>
          <div className="space-y-2.5">
            <ShortcutRow label="显示 / 隐藏窗口" keys={['⌘', '⌥', '\\']} />
            <ShortcutRow label="全局搜索股票代码" keys={['⌘', 'K']} />
            <ShortcutRow label="刷新当前页面" keys={['⌘', 'R']} />
          </div>
          <p className="mt-3 text-xs text-fg-subtle">全局快捷键在任意应用中均可触发</p>
        </div>

        {/* Claude AI */}
        <div className="card max-w-lg">
          <div className="mb-3 flex items-center gap-2">
            <Info size={14} className="text-accent" />
            <h3 className="text-sm font-semibold text-fg">Claude AI</h3>
          </div>

          {claude === null || checking ? (
            <div className="flex items-center gap-2 text-xs text-fg-subtle">
              <RefreshCw size={12} className="animate-spin" />
              检测中…
            </div>
          ) : claude.ok ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle size={13} className="text-accent-up" />
                <span className="text-xs text-accent-up font-medium">已连接</span>
              </div>
              {claude.version && (
                <p className="text-xs text-fg-muted font-mono">版本: {claude.version}</p>
              )}
              {claude.path && (
                <p className="text-xs text-fg-subtle font-mono truncate" title={claude.path}>
                  路径: {claude.path}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <XCircle size={13} className="text-accent-down" />
                <span className="text-xs text-accent-down font-medium">未找到 Claude CLI</span>
              </div>
              <p className="text-xs text-fg-subtle leading-relaxed">
                AI 分析功能需要安装 Claude Code CLI。<br />
                请运行: <code className="font-mono bg-bg-subtle px-1 rounded">npm install -g @anthropic-ai/claude-code</code>
              </p>
              {claude.error && (
                <p className="text-xs text-fg-subtle font-mono">{claude.error.slice(0, 100)}</p>
              )}
            </div>
          )}

          <button
            onClick={checkClaude}
            disabled={checking}
            className="btn mt-3 flex items-center gap-1.5 text-xs"
          >
            <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
            重新检测
          </button>
        </div>

        {/* 数据更新策略 */}
        <div className="card max-w-lg">
          <div className="mb-3 flex items-center gap-2">
            <Clock size={14} className="text-accent" />
            <h3 className="text-sm font-semibold text-fg">数据刷新策略</h3>
          </div>
          <div className="space-y-2">
            <CacheRow label="实时报价" value="5 分钟缓存" />
            <CacheRow label="历史行情" value="1 小时缓存" />
            <CacheRow label="期权链" value="30 分钟缓存" />
            <CacheRow label="新闻资讯" value="30 分钟缓存" />
            <CacheRow label="涨跌幅榜" value="15 分钟缓存" />
            <CacheRow label="每日机会榜" value="开盘前 09:00 ET 自动更新" />
            <CacheRow label="整点持仓 Insight" value="开盘期间 10:00–16:00 ET 每小时" />
          </div>
          <p className="mt-3 text-xs text-fg-subtle">数据来源: Yahoo Finance · 限流保护: 4 req/s</p>
        </div>

        {/* 应用信息 */}
        {appInfo && (
          <div className="card max-w-lg">
            <h3 className="mb-2 text-xs font-semibold text-fg-muted uppercase tracking-wider">应用信息</h3>
            <div className="space-y-1">
              <InfoRow label="版本" value={`v${appInfo.version}`} />
              <InfoRow label="平台" value={`${appInfo.platform} ${appInfo.arch}`} />
              <InfoRow label="Electron" value={appInfo.electron} />
              <InfoRow label="Node.js" value={appInfo.node} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-fg-muted">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            <kbd className="kbd">{k}</kbd>
            {i < keys.length - 1 && <span className="text-fg-subtle text-[10px]">+</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

function CacheRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg-subtle">{value}</span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-fg-subtle">{label}</span>
      <span className="font-mono text-fg-muted">{value}</span>
    </div>
  )
}
