import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Plus, Trash2, TrendingUp, TrendingDown, Check, X } from 'lucide-react'
import { useWatchlistStore } from '../stores/watchlist'

interface QuoteInfo {
  price: number
  changePercent: number
}

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function Watchlist() {
  const navigate = useNavigate()
  const { groups, items, loading, reload, addGroup, deleteGroup, removeItem } = useWatchlistStore()

  const [quotes, setQuotes] = useState<Record<string, QuoteInfo>>({})
  const [newGroupMode, setNewGroupMode] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    if (newGroupMode) {
      inputRef.current?.focus()
    }
  }, [newGroupMode])

  // Collect all symbols and fetch quotes
  useEffect(() => {
    const allSymbols = groups.flatMap((g) => (items[g.id] ?? []).map((i) => i.symbol))
    const unique = [...new Set(allSymbols)]
    if (!unique.length) return

    const fetchQuotes = async () => {
      const r = await window.api.market.quotes(unique)
      if (r.data) {
        const map: Record<string, QuoteInfo> = {}
        for (const q of r.data) {
          map[q.symbol] = { price: q.price, changePercent: q.changePercent }
        }
        setQuotes(map)
      }
    }

    void fetchQuotes()
    const t = setInterval(fetchQuotes, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [groups, items])

  const handleAddGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    await addGroup(name)
    setNewGroupName('')
    setNewGroupMode(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleAddGroup()
    if (e.key === 'Escape') {
      setNewGroupName('')
      setNewGroupMode(false)
    }
  }

  const handleDeleteGroup = async (id: number) => {
    if (deletingGroupId === id) {
      await deleteGroup(id)
      setDeletingGroupId(null)
    } else {
      setDeletingGroupId(id)
    }
  }

  const handleRemoveItem = async (groupId: number, symbol: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await removeItem(groupId, symbol)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center justify-between border-b border-border px-5 py-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <Star size={16} className="text-accent" />
          <span className="font-semibold text-fg">自选股</span>
        </div>
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />
          )}
          <button
            onClick={() => setNewGroupMode(true)}
            className="btn btn-primary flex items-center gap-1.5"
          >
            <Plus size={13} />
            新建分组
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* New group inline input */}
        {newGroupMode && (
          <div className="card flex items-center gap-2">
            <input
              ref={inputRef}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="分组名称…"
              className="flex-1 bg-transparent text-sm text-fg placeholder-fg-subtle outline-none"
            />
            <button
              onClick={() => void handleAddGroup()}
              className="flex h-7 w-7 items-center justify-center rounded text-accent hover:bg-accent/15 transition-colors"
              title="确认"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => { setNewGroupName(''); setNewGroupMode(false) }}
              className="flex h-7 w-7 items-center justify-center rounded text-fg-subtle hover:bg-bg-subtle transition-colors"
              title="取消"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Groups */}
        {groups.map((group) => {
          const groupItems = items[group.id] ?? []
          const isEmpty = groupItems.length === 0
          const isDeleting = deletingGroupId === group.id

          return (
            <div key={group.id} className="card">
              {/* Group header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-fg">{group.name}</span>
                <div className="flex items-center gap-1">
                  {isDeleting && (
                    <span className="text-xs text-fg-subtle mr-1">
                      {isEmpty ? '确认删除？' : '分组非空，仍删除？'}
                    </span>
                  )}
                  {isDeleting && (
                    <button
                      onClick={() => setDeletingGroupId(null)}
                      className="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-bg-subtle transition-colors"
                      title="取消"
                    >
                      <X size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => void handleDeleteGroup(group.id)}
                    className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                      isDeleting
                        ? 'text-accent-down hover:bg-accent-down/15'
                        : 'text-fg-subtle hover:bg-bg-subtle hover:text-accent-down'
                    }`}
                    title={isDeleting ? '确认删除' : '删除分组'}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Items */}
              {groupItems.length > 0 ? (
                <div className="space-y-1">
                  {groupItems.map((item) => {
                    const q = quotes[item.symbol]
                    const up = (q?.changePercent ?? 0) >= 0

                    return (
                      <div
                        key={item.id}
                        onClick={() => navigate(`/detail/${item.symbol}`)}
                        className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-bg-subtle transition-colors"
                      >
                        <span className="font-mono text-sm font-semibold text-fg min-w-[80px]">
                          {item.symbol}
                        </span>

                        <div className="flex flex-1 items-center justify-end gap-3 text-right">
                          {q ? (
                            <>
                              <span className="font-mono text-sm text-fg">
                                ${fmt(q.price)}
                              </span>
                              <div
                                className={`flex w-20 items-center justify-end gap-1 text-xs font-medium ${
                                  up ? 'text-accent-up' : 'text-accent-down'
                                }`}
                              >
                                {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                {up ? '+' : ''}{fmt(q.changePercent)}%
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-fg-subtle">—</span>
                          )}
                        </div>

                        <button
                          onClick={(e) => void handleRemoveItem(group.id, item.symbol, e)}
                          className="ml-1 hidden rounded p-1 text-fg-subtle hover:bg-bg hover:text-accent-down group-hover:flex"
                          title="移出分组"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-fg-subtle py-2 text-center">
                  暂无自选股，在详情页点击 ★ 加入此分组
                </p>
              )}
            </div>
          )
        })}

        {/* Empty state */}
        {groups.length === 0 && !loading && !newGroupMode && (
          <div className="empty-state animate-in">
            <div className="empty-state-icon">
              <Star size={32} />
            </div>
            <div>
              <p className="text-sm font-medium text-fg-muted">还没有自选分组</p>
              <p className="mt-1 text-xs text-fg-subtle max-w-xs">
                创建分组后，在股票详情页点击星标即可加入自选
              </p>
            </div>
            <button
              onClick={() => setNewGroupMode(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={14} />
              新建分组
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
