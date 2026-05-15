import { useEffect, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Trash2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { usePortfolioStore } from '../stores/portfolio'
import { useMarketStore } from '../stores/market'
import type { HoldingRow } from '../../electron/services/db'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function Portfolio() {
  const { holdings, loading, reload } = usePortfolioStore()
  const { quotes, setQuotes } = useMarketStore()
  const navigate = useNavigate()
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<import('../../electron/services/parser').HoldingRecord[] | null>(null)

  useEffect(() => { void reload() }, [reload])

  // refresh quotes for held symbols every 5 min
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
    // use Electron dialog via a hidden input as fallback
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
        console.error('Import error:', e)
        alert(`识别失败: ${(e as Error).message}`)
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
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-5 py-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="font-semibold text-fg">我的持仓</span>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => reload()} className="btn" disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
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
                  <div
                    key={h.id}
                    onClick={() => navigate(`/detail/${h.symbol}`)}
                    className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-bg-subtle transition-colors"
                  >
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
                    <button
                      onClick={(e) => { e.stopPropagation(); void del(h.id) }}
                      className="ml-1 hidden rounded p-1 text-fg-subtle hover:bg-bg hover:text-accent-down group-hover:flex"
                    >
                      <Trash2 size={13} />
                    </button>
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
                <div
                  key={h.id}
                  onClick={() => navigate(`/detail/${h.symbol}`)}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-bg-subtle transition-colors"
                >
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
                  <button
                    onClick={(e) => { e.stopPropagation(); void del(h.id) }}
                    className="ml-1 hidden rounded p-1 text-fg-subtle hover:bg-bg hover:text-accent-down group-hover:flex"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 空状态 */}
        {holdings.length === 0 && !loading && !importPreview && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-fg-muted">还没有持仓记录</p>
            <p className="mt-1 text-xs text-fg-subtle">点击"导入截图 / PDF"上传券商截图自动识别</p>
            <button onClick={handleImport} className="btn btn-primary mt-4 flex items-center gap-2">
              <Upload size={14} />
              导入持仓
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
