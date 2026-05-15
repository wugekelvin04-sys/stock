import { useEffect, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Trash2, TrendingUp, TrendingDown, RefreshCw, Briefcase, Pencil, X, Check } from 'lucide-react'
import { usePortfolioStore } from '../stores/portfolio'
import { useMarketStore } from '../stores/market'
import { toast } from '../stores/toast'
import type { HoldingRow } from '../../electron/services/db'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

interface EditState {
  symbol: string
  type: 'stock' | 'option'
  qty: string
  costBasis: string
  strike: string
  expiry: string
  side: 'call' | 'put' | ''
}

function EditModal({ row, onSave, onClose }: {
  row: HoldingRow
  onSave: (id: number, fields: Partial<HoldingRow>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<EditState>({
    symbol: row.symbol,
    type: row.type,
    qty: String(row.qty),
    costBasis: String(row.costBasis),
    strike: row.strike != null ? String(row.strike) : '',
    expiry: row.expiry ?? '',
    side: row.side ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(k: keyof EditState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    const qty = parseFloat(form.qty)
    const costBasis = parseFloat(form.costBasis)
    if (isNaN(qty) || qty <= 0) { toast.error('请输入有效的持仓数量', '格式错误'); return }
    if (isNaN(costBasis) || costBasis < 0) { toast.error('请输入有效的成本价', '格式错误'); return }
    setSaving(true)
    const fields: Partial<HoldingRow> = {
      symbol: form.symbol.toUpperCase().trim(),
      type: form.type,
      qty,
      costBasis,
      strike: form.strike ? parseFloat(form.strike) : undefined,
      expiry: form.expiry || undefined,
      side: form.side || undefined,
    }
    await onSave(row.id, fields)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[400px] rounded-xl border border-border bg-bg-elevated shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-fg">编辑持仓</span>
          <button onClick={onClose} className="rounded p-1 text-fg-subtle hover:text-fg transition-colors"><X size={14} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">股票代码</span>
              <input value={form.symbol} onChange={e => set('symbol', e.target.value)}
                className="input font-mono uppercase" placeholder="AAPL" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">类型</span>
              <select value={form.type} onChange={e => set('type', e.target.value as 'stock' | 'option')}
                className="input">
                <option value="stock">股票</option>
                <option value="option">期权</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">{form.type === 'option' ? '合约数' : '持仓股数'}</span>
              <input value={form.qty} onChange={e => set('qty', e.target.value)}
                className="input font-mono" placeholder="100" type="number" min="0" step="1" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">{form.type === 'option' ? '期权成本 (每股)' : '均价 / 成本价'}</span>
              <input value={form.costBasis} onChange={e => set('costBasis', e.target.value)}
                className="input font-mono" placeholder="0.00" type="number" min="0" step="0.01" />
            </label>
          </div>
          {form.type === 'option' && (
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-fg-subtle">方向</span>
                <select value={form.side} onChange={e => set('side', e.target.value)}
                  className="input">
                  <option value="">—</option>
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-fg-subtle">行权价</span>
                <input value={form.strike} onChange={e => set('strike', e.target.value)}
                  className="input font-mono" placeholder="200" type="number" min="0" step="0.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-fg-subtle">到期日</span>
                <input value={form.expiry} onChange={e => set('expiry', e.target.value)}
                  className="input font-mono" placeholder="2025-01-17" type="date" />
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="btn text-xs">取消</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center gap-1.5 text-xs">
            <Check size={12} />
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Modal (reuses EditModal with blank row) ───────────────────────────────

function AddModal({ onSave, onClose }: {
  onSave: (fields: Omit<HoldingRow, 'id'>) => Promise<void>
  onClose: () => void
}) {
  const blank: HoldingRow = { id: -1, symbol: '', type: 'stock', qty: 0, costBasis: 0 }
  return (
    <EditModal
      row={blank}
      onClose={onClose}
      onSave={async (_id, fields) => {
        await onSave(fields as Omit<HoldingRow, 'id'>)
      }}
    />
  )
}

// ── Portfolio page ────────────────────────────────────────────────────────────

export function Portfolio() {
  const { holdings, loading, reload } = usePortfolioStore()
  const { quotes, setQuotes } = useMarketStore()
  const navigate = useNavigate()
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<import('../../electron/services/parser').HoldingRecord[] | null>(null)
  const [editRow, setEditRow] = useState<HoldingRow | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    if (!holdings.length) return
    const symbols = [...new Set(holdings.map((h) => h.symbol))]
    const fetch = async () => {
      const r = await window.api.market.quotes(symbols)
      setQuotes(r.data)
    }
    void fetch()
    const t = setInterval(fetch, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [holdings, setQuotes])

  const handleImport = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,.pdf'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setImporting(true)
      try {
        const records = await window.api.portfolio.import(file.path ?? (file as File & { path?: string }).path ?? '')
        setImportPreview(records)
      } catch (e) {
        toast.error(`识别失败: ${(e as Error).message?.slice(0, 80)}`, '导入错误')
      } finally {
        setImporting(false)
      }
    }
    input.click()
  }, [])

  const confirmImport = useCallback(async () => {
    if (!importPreview) return
    await window.api.portfolio.save(importPreview)
    setImportPreview(null)
    await reload()
  }, [importPreview, reload])

  const handleUpdate = useCallback(async (id: number, fields: Partial<HoldingRow>) => {
    await window.api.portfolio.update(id, fields)
    await reload()
    toast.success('持仓已更新', fields.symbol ?? '')
  }, [reload])

  const handleAdd = useCallback(async (fields: Omit<HoldingRow, 'id'>) => {
    await window.api.portfolio.save([fields])
    setShowAdd(false)
    await reload()
    toast.success('已添加持仓', fields.symbol)
  }, [reload])

  const del = useCallback(async (id: number) => {
    await window.api.portfolio.delete(id)
    await reload()
  }, [reload])

  const stocks = holdings.filter((h) => h.type === 'stock')
  const options = holdings.filter((h) => h.type === 'option')

  function pnl(h: HoldingRow) {
    const q = quotes[h.symbol]
    if (!q) return null
    const gain = (q.price - h.costBasis) * h.qty
    const pct = (q.price - h.costBasis) / h.costBasis * 100
    return { gain, pct, price: q.price }
  }

  const totalValue = stocks.reduce((s, h) => {
    const q = quotes[h.symbol]
    return s + (q ? q.price * h.qty : h.costBasis * h.qty)
  }, 0)
  const totalCost = stocks.reduce((s, h) => s + h.costBasis * h.qty, 0)
  const totalPnl = totalValue - totalCost

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Edit / Add modals */}
      {editRow && <EditModal row={editRow} onSave={handleUpdate} onClose={() => setEditRow(null)} />}
      {showAdd && <AddModal onSave={handleAdd} onClose={() => setShowAdd(false)} />}

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-5 py-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="font-semibold text-fg">我的持仓</span>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => reload()} className="btn" disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowAdd(true)} className="btn flex items-center gap-1.5 text-xs">
            <Pencil size={13} />
            手动添加
          </button>
          <button onClick={handleImport} disabled={importing} className="btn btn-primary flex items-center gap-1.5">
            <Upload size={13} />
            {importing ? '识别中…' : '导入截图 / PDF'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 导入预览 */}
        {importPreview && (
          <div className="card border-accent/30 bg-accent/5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-fg">识别结果预览 ({importPreview.length} 条)</span>
              <div className="flex gap-2">
                <button onClick={() => setImportPreview(null)} className="btn text-xs">取消</button>
                <button onClick={confirmImport} className="btn btn-primary text-xs">确认入库</button>
              </div>
            </div>
            <div className="space-y-1">
              {importPreview.map((r, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="font-mono font-bold text-fg">{r.symbol}</span>
                  <span className="text-fg-muted">{r.type}</span>
                  <span className="text-fg-muted">×{r.qty}</span>
                  <span className="text-fg-muted">成本 ${fmt(r.costBasis)}</span>
                  {r.strike && <span className="text-fg-subtle">strike ${r.strike} {r.side} {r.expiry}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 总览 */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="card">
              <p className="text-xs text-fg-subtle">持仓市值</p>
              <p className="mt-1 font-mono text-lg font-semibold text-fg">${fmt(totalValue)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-fg-subtle">总成本</p>
              <p className="mt-1 font-mono text-lg font-semibold text-fg">${fmt(totalCost)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-fg-subtle">总盈亏</p>
              <p className={`mt-1 font-mono text-lg font-semibold ${totalPnl >= 0 ? 'text-accent-up' : 'text-accent-down'}`}>
                {totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)}
              </p>
            </div>
          </div>
        )}

        {/* 股票持仓 */}
        {stocks.length > 0 && (
          <div className="card">
            <h3 className="mb-3 text-sm font-semibold text-fg">股票</h3>
            <div className="space-y-1">
              {stocks.map((h) => {
                const p = pnl(h)
                return (
                  <div key={h.id}
                    onClick={() => navigate(`/detail/${h.symbol}`)}
                    className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-bg-subtle transition-colors">
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm font-semibold text-fg">{h.symbol}</span>
                      <span className="ml-2 text-xs text-fg-muted">×{h.qty}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs text-fg-muted">成本 ${fmt(h.costBasis)}</p>
                      {p ? <p className="font-mono text-xs text-fg">现价 ${fmt(p.price)}</p> : null}
                    </div>
                    {p ? (
                      <div className={`flex w-20 items-center justify-end gap-1 text-xs font-medium ${p.pct >= 0 ? 'text-accent-up' : 'text-accent-down'}`}>
                        {p.pct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {p.pct >= 0 ? '+' : ''}{fmt(p.pct)}%
                      </div>
                    ) : <div className="w-20" />}
                    <div className="ml-1 hidden items-center gap-1 group-hover:flex">
                      <button onClick={(e) => { e.stopPropagation(); setEditRow(h) }}
                        className="rounded p-1 text-fg-subtle hover:bg-bg hover:text-accent transition-colors">
                        <Pencil size={12} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); void del(h.id) }}
                        className="rounded p-1 text-fg-subtle hover:bg-bg hover:text-accent-down transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 期权持仓 */}
        {options.length > 0 && (
          <div className="card">
            <h3 className="mb-3 text-sm font-semibold text-fg">期权</h3>
            <div className="space-y-1">
              {options.map((h) => (
                <div key={h.id}
                  onClick={() => navigate(`/detail/${h.symbol}`)}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-bg-subtle transition-colors">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-sm font-semibold text-fg">{h.symbol}</span>
                    <span className={`ml-2 text-xs font-medium ${h.side === 'call' ? 'text-accent-up' : 'text-accent-down'}`}>
                      {h.side?.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right text-xs text-fg-muted font-mono">
                    <p>Strike ${h.strike} · {h.expiry}</p>
                    <p>成本 ${fmt(h.costBasis)} × {h.qty}</p>
                  </div>
                  <div className="ml-1 hidden items-center gap-1 group-hover:flex">
                    <button onClick={(e) => { e.stopPropagation(); setEditRow(h) }}
                      className="rounded p-1 text-fg-subtle hover:bg-bg hover:text-accent transition-colors">
                      <Pencil size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); void del(h.id) }}
                      className="rounded p-1 text-fg-subtle hover:bg-bg hover:text-accent-down transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 空状态 */}
        {holdings.length === 0 && !loading && !importPreview && (
          <div className="empty-state animate-in">
            <div className="empty-state-icon"><Briefcase size={32} /></div>
            <div>
              <p className="text-sm font-medium text-fg-muted">还没有持仓记录</p>
              <p className="mt-1 text-xs text-fg-subtle max-w-xs">
                上传券商 App 截图或 PDF，Claude 自动识别股票、期权持仓及成本
              </p>
            </div>
            <div className="flex flex-col gap-2 items-center">
              <div className="flex gap-2">
                <button onClick={() => setShowAdd(true)} className="btn flex items-center gap-2">
                  <Pencil size={14} />
                  手动添加
                </button>
                <button onClick={handleImport} className="btn btn-primary flex items-center gap-2">
                  <Upload size={14} />
                  导入截图 / PDF
                </button>
              </div>
              <p className="text-xs text-fg-subtle">支持 Robinhood、Webull、TD 等主流券商截图</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
