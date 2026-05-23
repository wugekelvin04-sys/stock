import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, RefreshCw, Keyboard, Info, Clock, Save, Cpu } from 'lucide-react'
import type { AiSettings, PrefetchSettings } from '../../electron/services/db'
import { toast } from '../stores/toast'

interface ClaudeInfo { ok: boolean; version?: string; path?: string; error?: string }
interface AppInfo { version: string; platform: string; arch: string; node: string; electron: string }

export function Settings() {
  const [claude, setClaude] = useState<ClaudeInfo | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [ai, setAi] = useState<AiSettings | null>(null)
  const [prefetch, setPrefetch] = useState<PrefetchSettings | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [savingAi, setSavingAi] = useState(false)

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
    window.api.settings.getAi().then(setAi).catch(() => {})
    window.api.settings.getPrefetch().then(setPrefetch).catch(() => {})
  }, [])

  const saveAiSettings = async () => {
    if (!ai) return
    setSavingAi(true)
    try {
      const updated = await window.api.settings.updateAi({
        openrouterApiKey: apiKeyInput,
        openrouterApiBase: ai.openrouterApiBase,
        analysisModel: ai.analysisModel,
        searchModel: ai.searchModel,
        cheapModel: ai.cheapModel,
        searchEnabled: ai.searchEnabled,
        searchEngine: ai.searchEngine,
        searchMaxResults: ai.searchMaxResults,
        searchMaxCalls: ai.searchMaxCalls,
      })
      setAi(updated)
      setApiKeyInput('')
      toast.success('AI API 配置已保存')
    } catch (e) {
      toast.error((e as Error).message, '保存失败')
    } finally {
      setSavingAi(false)
    }
  }

  const savePrefetchSettings = async (next: Partial<PrefetchSettings>) => {
    if (!prefetch) return
    const optimistic = { ...prefetch, ...next }
    setPrefetch(optimistic)
    try {
      const updated = await window.api.settings.updatePrefetch(next)
      setPrefetch(updated)
    } catch (e) {
      setPrefetch(prefetch)
      toast.error((e as Error).message, '保存失败')
    }
  }

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

        {/* API AI */}
        <div className="card max-w-2xl">
          <div className="mb-3 flex items-center gap-2">
            <Cpu size={14} className="text-accent" />
            <h3 className="text-sm font-semibold text-fg">AI API</h3>
          </div>

          {!ai ? (
            <div className="flex items-center gap-2 text-xs text-fg-subtle">
              <RefreshCw size={12} className="animate-spin" />
              读取配置中…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {ai.openrouterApiKeyConfigured
                  ? <CheckCircle size={13} className="text-accent-up" />
                  : <XCircle size={13} className="text-accent-down" />}
                <span className={`text-xs font-medium ${ai.openrouterApiKeyConfigured ? 'text-accent-up' : 'text-accent-down'}`}>
                  OpenRouter {ai.openrouterApiKeyConfigured ? '已配置' : '未配置'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <TextField label="OpenRouter API Key" value={apiKeyInput} type="password"
                  placeholder={ai.openrouterApiKeyConfigured ? '已保存，留空不修改' : 'sk-or-...'}
                  onChange={setApiKeyInput} />
                <TextField label="API Base" value={ai.openrouterApiBase}
                  onChange={(v) => setAi({ ...ai, openrouterApiBase: v })} />
                <TextField label="Analysis Model" value={ai.analysisModel}
                  onChange={(v) => setAi({ ...ai, analysisModel: v })} />
                <TextField label="Search Model" value={ai.searchModel}
                  onChange={(v) => setAi({ ...ai, searchModel: v })} />
                <TextField label="Cheap Model" value={ai.cheapModel}
                  onChange={(v) => setAi({ ...ai, cheapModel: v })} />
                <TextField label="Search Engine" value={ai.searchEngine}
                  placeholder="parallel / exa / native"
                  onChange={(v) => setAi({ ...ai, searchEngine: v as AiSettings['searchEngine'] })} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <ToggleField label="允许搜索" checked={ai.searchEnabled}
                  onChange={(v) => setAi({ ...ai, searchEnabled: v })} />
                <NumberField label="搜索结果数" value={ai.searchMaxResults} min={1} max={10}
                  onChange={(v) => setAi({ ...ai, searchMaxResults: v })} />
                <NumberField label="搜索调用上限" value={ai.searchMaxCalls} min={0} max={5}
                  onChange={(v) => setAi({ ...ai, searchMaxCalls: v })} />
              </div>

              <div className="flex items-center gap-2">
                <button onClick={saveAiSettings} disabled={savingAi}
                  className="btn btn-primary flex items-center gap-1.5 text-xs">
                  <Save size={11} />
                  {savingAi ? '保存中…' : '保存 API 配置'}
                </button>
                <p className="text-xs text-fg-subtle">
                  股票分析和自动任务使用 API；聊天和持仓导入仍使用 Claude Code。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 后台预取 */}
        {prefetch && (
          <div className="card max-w-2xl">
            <div className="mb-3 flex items-center gap-2">
              <RefreshCw size={14} className="text-accent" />
              <h3 className="text-sm font-semibold text-fg">后台预取</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ToggleField label="启用后台预取" checked={prefetch.enabled}
                onChange={(v) => void savePrefetchSettings({ enabled: v })} />
              <ToggleField label="允许预取时搜索" checked={prefetch.allowSearch}
                onChange={(v) => void savePrefetchSettings({ allowSearch: v })} />
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-fg-subtle">范围</span>
                <select value={prefetch.scope}
                  onChange={(e) => void savePrefetchSettings({ scope: e.target.value as PrefetchSettings['scope'] })}
                  className="input text-xs">
                  <option value="holdings">仅持仓</option>
                  <option value="holdings_watchlist">持仓 + 自选 + 榜单</option>
                </select>
              </label>
              <NumberField label="每轮最多股票数" value={prefetch.maxSymbolsPerRun} min={1} max={100}
                onChange={(v) => void savePrefetchSettings({ maxSymbolsPerRun: v })} />
              <NumberField label="间隔分钟" value={prefetch.intervalMinutes} min={10} max={1440}
                onChange={(v) => void savePrefetchSettings({ intervalMinutes: v })} />
            </div>
            <p className="mt-3 text-xs text-fg-subtle">
              默认关闭。开启后仍按数量限制运行，且默认不搜索，避免后台成本失控。
            </p>
          </div>
        )}

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

function TextField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type}
        className="input font-mono text-xs" />
    </label>
  )
}

function NumberField({ label, value, min, max, onChange }: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <input value={value} min={min} max={max} type="number"
        onChange={(e) => onChange(Number(e.target.value))}
        className="input font-mono text-xs" />
    </label>
  )
}

function ToggleField({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2">
      <span className="text-xs text-fg-muted">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent" />
    </label>
  )
}
