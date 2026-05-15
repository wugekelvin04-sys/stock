import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Briefcase, Star, Search, Settings, MessageSquare, Activity } from 'lucide-react'
import { SearchBar } from './SearchBar'
import { PrefetchTaskPanel } from './PrefetchTaskPanel'
import { useEffect, useState } from 'react'
import { toast } from '../stores/toast'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: '市场' },
  { to: '/portfolio', icon: Briefcase, label: '持仓' },
  { to: '/watchlist', icon: Star, label: '自选' },
  { to: '/chat', icon: MessageSquare, label: 'Claude' },
]

export function Layout() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [prefetchRunning, setPrefetchRunning] = useState(false)

  useEffect(() => {
    const unsub = window.api.prefetch.onStatus(s => setPrefetchRunning(s.running))
    return () => { unsub() }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Scheduler push notifications via toast
  useEffect(() => {
    const unsubPicks = window.api.insight.onDailyPicksUpdated((payload) => {
      toast.success(`Claude 精选了 ${payload.picks.length} 支今日机会股`, '今日机会榜已更新')
    })
    const unsubInsight = window.api.insight.onInsightUpdated(() => {
      toast.info('持仓整点 Insight 已更新', '市场动态')
    })
    return () => { unsubPicks(); unsubInsight() }
  }, [])

  return (
    <div className="flex h-full relative">
      {/* Sidebar */}
      <aside className="flex w-14 flex-col items-center gap-1 border-r border-border bg-bg py-3">
        {/* drag region at top */}
        <div className="h-6 w-full" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={label}
            className={({ isActive }) =>
              `flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted'
              }`
            }
          >
            <Icon size={18} />
          </NavLink>
        ))}

        <div className="flex-1" />

        <button
          title="后台任务"
          onClick={() => setTaskOpen(p => !p)}
          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition-colors ${taskOpen ? 'bg-accent/15 text-accent' : 'text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted'}`}
        >
          <Activity size={18} />
          {prefetchRunning && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent animate-pulse" />
          )}
        </button>
        <button
          title="搜索 (⌘K)"
          onClick={() => setSearchOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg-muted"
        >
          <Search size={18} />
        </button>
        <NavLink
          to="/settings"
          title="设置"
          className="flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg-muted"
        >
          <Settings size={18} />
        </NavLink>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>

      {taskOpen && <PrefetchTaskPanel onClose={() => setTaskOpen(false)} />}
      {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
