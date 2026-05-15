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

/** Convert ISO string to lwc UTCTimestamp (seconds).
 *  Shift by local timezone offset so lwc's UTC display matches local wall-clock time. */
function toUTC(raw: string): UTCTimestamp {
  const ms = new Date(raw).getTime()
  const offsetMs = new Date().getTimezoneOffset() * -60 * 1000
  return Math.floor((ms + offsetMs) / 1000) as UTCTimestamp
}

/** Format the shifted UTCTimestamp back to local HH:MM.
 *  ts is already offset-adjusted, so treat as UTC to get local wall-clock. */
function fmtIntraday(ts: number): string {
  const d = new Date(ts * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * NYSE session boundaries in UTC hours (EDT = UTC-4).
 * Pre-market:  04:00–09:30 ET  = 08:00–13:30 UTC
 * Regular:     09:30–16:00 ET  = 13:30–20:00 UTC
 * After-hours: 16:00–20:00 ET  = 20:00–00:00 UTC
 */
type Session = 'pre' | 'regular' | 'after'
function getSession(isoStr: string): Session {
  const utcH = new Date(isoStr).getUTCHours()
  const utcM = new Date(isoStr).getUTCMinutes()
  const utcMins = utcH * 60 + utcM
  if (utcMins < 13 * 60 + 30) return 'pre'       // < 13:30 UTC
  if (utcMins < 20 * 60) return 'regular'          // < 20:00 UTC
  return 'after'
}

const COLORS = {
  bg: '#0b0d12', grid: '#1a1e27', text: '#8b94a7',
  up: '#22c55e', down: '#ef4444', ma20: '#3b82f6', ma50: '#f59e0b', cost: '#a855f7',
  pre: '#f59e0b',    // 盘前 — 黄
  regular: '#3b82f6',// 盘中 — 蓝
  after: '#a855f7',  // 盘后 — 紫
}

const TOOLTIP_W = 320

export function PriceChart({ bars, costBasis, height = 340, mode = 'candle' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, price: 0, time: '' })

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: COLORS.bg }, textColor: COLORS.text, fontSize: 11 },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal, horzLine: { labelVisible: false }, vertLine: { labelVisible: false } },
      handleScale: {
        mouseWheel: false,
        pinch: false,
        axisPressedMouseMove: false,
      },
      rightPriceScale: { borderColor: COLORS.grid },
      timeScale: {
        borderColor: COLORS.grid,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
      },
      width: containerRef.current.clientWidth,
      height,
    })
    chartRef.current = chart

    if (mode === 'line') {
      // Split bars into three session segments and render each with its own color
      const segments: Record<Session, { time: UTCTimestamp; value: number }[]> = {
        pre: [], regular: [], after: [],
      }
      for (const b of bars) {
        segments[getSession(b.date)].push({ time: toUTC(b.date), value: b.close })
      }

      const sessionColors: Record<Session, string> = {
        pre: COLORS.pre, regular: COLORS.regular, after: COLORS.after,
      }
      // Add bridge points at session boundaries so lines connect visually
      if (segments.pre.length > 0 && segments.regular.length > 0) {
        segments.pre.push(segments.regular[0])
      }
      if (segments.regular.length > 0 && segments.after.length > 0) {
        segments.regular.push(segments.after[0])
      }

      // Invisible anchor series: one point every 5 min from 00:00 to 23:55 local time.
      // This gives lwc a uniform time grid for the full day so the axis spacing is even.
      const anchor = chart.addSeries(LineSeries, {
        color: 'rgba(0,0,0,0)', lineWidth: 1,
        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
      })
      const midPrice = bars.length > 0 ? bars[Math.floor(bars.length / 2)].close : 0
      const anchorData: { time: UTCTimestamp; value: number }[] = []
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
      for (let m = 0; m < 24 * 60; m += 5) {
        const t = new Date(dayStart.getTime() + m * 60 * 1000)
        anchorData.push({ time: toUTC(t.toISOString()), value: midPrice })
      }
      anchor.setData(anchorData)

      // Create one series per session that has data; track them all for crosshair
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seriesList: any[] = []
      for (const session of ['pre', 'regular', 'after'] as Session[]) {
        const data = segments[session]
        if (data.length === 0) continue
        const s = chart.addSeries(LineSeries, {
          color: sessionColors[session],
          lineWidth: 2,
          crosshairMarkerVisible: true,
          lastValueVisible: session === 'after' || (session === 'regular' && segments.after.length === 0),
          priceLineVisible: false,
        })
        s.setData(data)
        seriesList.push(s)
      }

      chart.subscribeCrosshairMove((param) => {
        if (!param.point || !param.time || param.point.x < 0) {
          setTooltip(t => ({ ...t, visible: false })); return
        }
        // Find value from whichever series has data at this crosshair position
        let price: number | null = null
        for (const s of seriesList) {
          const v = param.seriesData.get(s) as { value?: number } | undefined
          if (v?.value != null) { price = v.value; break }
        }
        if (price == null) { setTooltip(t => ({ ...t, visible: false })); return }
        const cw = containerRef.current?.clientWidth ?? 0
        const x = Math.min(Math.max(param.point.x - TOOLTIP_W / 2, 4), cw - TOOLTIP_W - 4)
        setTooltip({ visible: true, x, price, time: fmtIntraday(param.time as number) })
      })
    } else {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: COLORS.up, downColor: COLORS.down,
        borderUpColor: COLORS.up, borderDownColor: COLORS.down,
        wickUpColor: COLORS.up, wickDownColor: COLORS.down,
      })
      // Dedupe by date string (Yahoo sometimes returns duplicate dates for the same day)
      const seenDates = new Map<string, typeof bars[0]>()
      for (const b of bars) seenDates.set(toDateStr(b.date), b)
      const dedupedBars = [...seenDates.values()].sort((a, b) => a.date < b.date ? -1 : 1)
      candleSeries.setData(dedupedBars.map((b) => ({
        time: toDateStr(b.date), open: b.open, high: b.high, low: b.low, close: b.close,
      })))

      if (dedupedBars.length >= 20) {
        const ma20 = chart.addSeries(LineSeries, {
          color: COLORS.ma20, lineWidth: 1, title: 'MA20',
          crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        })
        ma20.setData(sma(dedupedBars, 20))
      }
      if (dedupedBars.length >= 50) {
        const ma50 = chart.addSeries(LineSeries, {
          color: COLORS.ma50, lineWidth: 1, title: 'MA50',
          crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        })
        ma50.setData(sma(dedupedBars, 50))
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
          time: String(param.time).slice(5), // MM-DD from YYYY-MM-DD
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
          className="pointer-events-none absolute top-2 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tooltip.x, width: TOOLTIP_W, zIndex: 10 }}
        >
          <span className="text-fg-subtle shrink-0">{tooltip.time}</span>
          <span className="font-mono font-semibold text-fg shrink-0">${fmt(tooltip.price)}</span>
          {mode === 'candle' && tooltip.open != null && tooltip.open > 0 && (
            <span className="font-mono text-fg-subtle text-[11px] shrink-0">
              O {fmt(tooltip.open)} H {fmt(tooltip.high ?? 0)} L {fmt(tooltip.low ?? 0)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
