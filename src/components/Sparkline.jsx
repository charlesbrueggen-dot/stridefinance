// src/components/Sparkline.jsx
// Minimal hand-rolled SVG sparkline (no recharts) — used in the sidebar where
// it's always mounted on every page, so pulling in the full recharts bundle
// there (recharts is otherwise only ever imported by lazy-loaded page chunks)
// would work against the app's route-level code-splitting.
export default function Sparkline({ values, width = 200, height = 32 }) {
  if (!values || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(' ')
  const trendUp = values[values.length - 1] >= values[0]
  const color = trendUp ? 'var(--positive)' : 'var(--negative)'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
