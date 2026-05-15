import { useMemo } from 'react'

interface Props {
  prices: number[]   // 收盘价数组（日内5分钟，或近期收盘价）
  width?: number
  height?: number
  up?: boolean       // true=绿线, false=红线, undefined=自动判断
}

export function MiniSparkline({ prices, width = 64, height = 24, up }: Props) {
  const path = useMemo(() => {
    if (prices.length < 2) return ''
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const range = max - min || 1
    const pts = prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * width
      const y = height - ((p - min) / range) * (height - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return 'M' + pts.join('L')
  }, [prices, width, height])

  if (!path) return <div style={{ width, height }} />

  const isUp = up ?? (prices[prices.length - 1] >= prices[0])
  const color = isUp ? '#22c55e' : '#ef4444'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
