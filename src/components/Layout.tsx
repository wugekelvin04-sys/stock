import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Briefcase, Search, Settings } from 'lucide-react'
import { SearchBar } from './SearchBar'
import { useEffect, useState } from 'react'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: '市场' },
  { to: '/portfolio', icon: Briefcase, label: '持仓' },
]

export function Layout() {
  const [searchOpen, setSearchOpen] = useState(false)

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

  return (
    <div className="flex h-full">
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

      {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
