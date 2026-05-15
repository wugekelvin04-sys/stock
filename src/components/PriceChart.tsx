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
  x: number
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
    result.push({ time: bars[i].date, value: parseFloat((sum / period).toFixed(4)) })
  }
  return result
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtTime(ts: number | string, isIntraday: boolean): string {
  if (isIntraday && typeof ts === 'number') {
    return new Date(ts * 1000).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York', hour12: false,
    }) + ' ET'
  }
  if (typeof ts === 'string') return ts
  return String(ts)
}

const COLORS = {
  bg: '#0b0d12',
  grid: '#1a1e27',
  text: '#8b94a7',
  up: '#22c55e',
  down: '#ef4444',
  ma20: '#3b82f6',
  ma50: '#f59e0b',
  cost: '#a855f7',
}

export function PriceChart({ bars, costBasis, height = 340, mode = 'candle' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, price: 0, time: '' })

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor: COLORS.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: COLORS.grid },
      timeScale: {
        borderColor: COLORS.grid,
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height,
    })
    chartRef.current = chart

    if (mode === 'line') {
      const lineSeries = chart.addSeries(LineSeries, {
        color: COLORS.ma20,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
      })
      const data = bars.map((b) => ({
        time: Math.floor(new Date(b.date).getTime() / 1000) as UTCTimestamp,
        value: b.close,
      }))
      lineSeries.setData(data)

      chart.subscribeCrosshairMove((param) => {
        if (!param.point || !param.time) {
          setTooltip(t => ({ ...t, visible: false }))
          return
        }
        const v = param.seriesData.get(lineSeries) as { value?: number } | undefined
        if (v?.value == null) { setTooltip(t => ({ ...t, visible: false })); return }
        setTooltip({
          visible: true,
          x: param.point.x,
          price: v.value,
          time: fmtTime(param.time as number, true),
        })
      })
    } else {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: COLORS.up,
        downColor: COLORS.down,
        borderUpColor: COLORS.up,
        borderDownColor: COLORS.down,
        wickUpColor: COLORS.up,
        wickDownColor: COLORS.down,
      })
      candleSeries.setData(
        bars.map((b) => ({
          time: b.date,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      )

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
        if (!param.point || !param.time) {
          setTooltip(t => ({ ...t, visible: false }))
          return
        }
        const bar = param.seriesData.get(candleSeries) as {
          open?: number; high?: number; low?: number; close?: number
        } | undefined
        if (bar?.close == null) { setTooltip(t => ({ ...t, visible: false })); return }
        setTooltip({
          visible: true,
          x: param.point.x,
          price: bar.close,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          time: fmtTime(param.time as string, false),
        })
      })
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      setTooltip(t => ({ ...t, visible: false }))
    }
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

      {/* Crosshair tooltip */}
      {tooltip.visible && (
        <div
          className="pointer-events-none absolute top-2 left-3 flex items-center gap-3 rounded-md border border-border bg-bg-elevated/90 px-2.5 py-1.5 backdrop-blur-sm"
          style={{ zIndex: 10 }}
        >
          <span className="text-xs text-fg-subtle">{tooltip.time}</span>
          {mode === 'line' ? (
            <span className="font-mono text-sm font-semibold text-fg">${fmt(tooltip.price)}</span>
          ) : (
            <>
              <span className="font-mono text-sm font-semibold text-fg">${fmt(tooltip.price)}</span>
              {tooltip.open != null && (
                <span className="text-xs text-fg-subtle font-mono">
                  O {fmt(tooltip.open)} H {fmt(tooltip.high ?? 0)} L {fmt(tooltip.low ?? 0)}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
