import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts'
import type { HistoryBar } from '../../electron/services/market'

interface Props {
  bars: HistoryBar[]
  costBasis?: number
  height?: number
  mode?: 'candle' | 'line'
}

function sma(bars: HistoryBar[], period: number): { time: string; value: number }[] {
  const result: { time: string; value: number }[] = []
  for (let i = period - 1; i < bars.length; i++) {
    const sum = bars.slice(i - period + 1, i + 1).reduce((s, b) => s + b.close, 0)
    result.push({ time: bars[i].date, value: parseFloat((sum / period).toFixed(4)) })
  }
  return result
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
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)

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
      // Line chart mode (for intraday data)
      const lineSeries = chart.addSeries(LineSeries, {
        color: COLORS.ma20,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
      })
      lineSeries.setData(
        bars.map((b) => ({ time: b.date, value: b.close })),
      )
    } else {
      // Candlestick mode
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

      // MA 20
      if (bars.length >= 20) {
        const ma20Series = chart.addSeries(LineSeries, {
          color: COLORS.ma20,
          lineWidth: 1,
          title: 'MA20',
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        ma20Series.setData(sma(bars, 20))
      }

      // MA 50
      if (bars.length >= 50) {
        const ma50Series = chart.addSeries(LineSeries, {
          color: COLORS.ma50,
          lineWidth: 1,
          title: 'MA50',
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        ma50Series.setData(sma(bars, 50))
      }

      // Cost basis line
      if (costBasis) {
        candleSeries.createPriceLine({
          price: costBasis,
          color: COLORS.cost,
          lineWidth: 1,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: '成本',
        })
      }
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [bars, costBasis, height, mode])

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-bg" style={{ height }}>
        <p className="text-xs text-fg-subtle">暂无历史数据</p>
      </div>
    )
  }

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" style={{ height }} />
}
