import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type UTCTimestamp,
  type IChartApi,
} from 'lightweight-charts'
import type { HistoryBar } from '../../electron/services/market'

interface Props {
  bars: HistoryBar[]
  costBasis?: number
  height?: number
  mode?: 'candle' | 'line'
}

interface TooltipState {
  visible: boolean
  x: number        // bar 的像素 x（列中心）
  price: number
  open?: number
  high?: number
  low?: number
  time: string
}

function sma(bars: HistoryBar[], period: number): { time: string; value: number }[] {
  const result: { time: string; value: number }[] = []
  for (let i = period - 1; i < bars.length; i++) {
    const sum = bars.slice(i - period + 1, i + 1).reduce((s, b) => s + b.close, 0)
    result.push({ time: bars[i].date.slice(0, 10), value: parseFloat((sum / period).toFixed(4)) })
  }
  return result
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Normalize to YYYY-MM-DD for lwc daily series */
function toDateStr(raw: string): string { return raw.slice(0, 10) }

/** Convert ISO string to lwc UTCTimestamp (seconds) */
function toUTC(raw: string): UTCTimestamp {
  return Math.floor(new Date(raw).getTime() / 1000) as UTCTimestamp
}

function fmtIntraday(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York', hour12: false,
  }) + ' ET'
}

const COLORS = {
  bg: '#0b0d12', grid: '#1a1e27', text: '#8b94a7',
  up: '#22c55e', down: '#ef4444', ma20: '#3b82f6', ma50: '#f59e0b', cost: '#a855f7',
}

const TOOLTIP_W = 280

export function PriceChart({ bars, costBasis, height = 340, mode = 'candle' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, price: 0, time: '' })

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: COLORS.bg }, textColor: COLORS.text, fontSize: 11 },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: COLORS.grid },
      timeScale: { borderColor: COLORS.grid, timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height,
    })
    chartRef.current = chart

    if (mode === 'line') {
      const lineSeries = chart.addSeries(LineSeries, {
        color: COLORS.ma20, lineWidth: 2,
        crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: false,
      })
      lineSeries.setData(bars.map((b) => ({ time: toUTC(b.date), value: b.close })))

      chart.subscribeCrosshairMove((param) => {
        if (!param.point || !param.time || param.point.x < 0) {
          setTooltip(t => ({ ...t, visible: false })); return
        }
        const v = param.seriesData.get(lineSeries) as { value?: number } | undefined
        if (v?.value == null) { setTooltip(t => ({ ...t, visible: false })); return }
        const cw = containerRef.current?.clientWidth ?? 0
        // Tooltip follows crosshair x (bar position), clamped to container
        const x = Math.min(Math.max(param.point.x - TOOLTIP_W / 2, 4), cw - TOOLTIP_W - 4)
        setTooltip({ visible: true, x, price: v.value, time: fmtIntraday(param.time as number) })
      })
    } else {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: COLORS.up, downColor: COLORS.down,
        borderUpColor: COLORS.up, borderDownColor: COLORS.down,
        wickUpColor: COLORS.up, wickDownColor: COLORS.down,
      })
      candleSeries.setData(bars.map((b) => ({
        time: toDateStr(b.date), open: b.open, high: b.high, low: b.low, close: b.close,
      })))

      if (bars.length >= 20) {
        const ma20 = chart.addSeries(LineSeries, {
          color: COLORS.ma20, lineWidth: 1, title: 'MA20',
          crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        })
        ma20.setData(sma(bars, 20))
      }
      if (bars.length >= 50) {
        const ma50 = chart.addSeries(LineSeries, {
          color: COLORS.ma50, lineWidth: 1, title: 'MA50',
          crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        })
        ma50.setData(sma(bars, 50))
      }
      if (costBasis) {
        candleSeries.createPriceLine({
          price: costBasis, color: COLORS.cost, lineWidth: 1,
          lineStyle: 2, axisLabelVisible: true, title: '成本',
        })
      }

      chart.subscribeCrosshairMove((param) => {
        if (!param.point || !param.time || param.point.x < 0) {
          setTooltip(t => ({ ...t, visible: false })); return
        }
        const bar = param.seriesData.get(candleSeries) as {
          open?: number; high?: number; low?: number; close?: number
        } | undefined
        if (bar?.close == null) { setTooltip(t => ({ ...t, visible: false })); return }
        const cw = containerRef.current?.clientWidth ?? 0
        const x = Math.min(Math.max(param.point.x - TOOLTIP_W / 2, 4), cw - TOOLTIP_W - 4)
        setTooltip({
          visible: true, x,
          price: bar.close, open: bar.open, high: bar.high, low: bar.low,
          time: String(param.time),
        })
      })
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null }
  }, [bars, costBasis, height, mode])

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-bg" style={{ height }}>
        <p className="text-xs text-fg-subtle">暂无历史数据</p>
      </div>
    )
  }

  return (
    <div className="relative w-full rounded-lg overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Tooltip — centered on the crosshair bar, pinned near top */}
      {tooltip.visible && (
        <div
          className="pointer-events-none absolute top-2 flex items-center gap-2.5 rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tooltip.x, width: TOOLTIP_W, zIndex: 10 }}
        >
          <span className="text-fg-subtle shrink-0">{tooltip.time}</span>
          <span className="font-mono font-semibold text-fg shrink-0">${fmt(tooltip.price)}</span>
          {mode === 'candle' && tooltip.open != null && tooltip.open > 0 && (
            <span className="font-mono text-fg-subtle text-[11px] truncate">
              O {fmt(tooltip.open)} H {fmt(tooltip.high ?? 0)} L {fmt(tooltip.low ?? 0)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
