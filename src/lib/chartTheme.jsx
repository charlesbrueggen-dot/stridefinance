import { Sector } from 'recharts'

// Shared pie chart palette/styling used across Income, Analytics, Investments & Dashboard.

// Theme-tinted palette (blue shades in light mode, green shades in dark mode).
export const PIE_COLORS_LIGHT = ['#3b82f6','#60a5fa','#93c5fd','#bfdbfe','#2563eb','#1d4ed8','#1e40af','#dbeafe','#93c5fd','#60a5fa']
export const PIE_COLORS_DARK  = ['#10b981','#34d399','#6ee7b7','#a7f3d0','#059669','#047857','#065f46','#d1fae5','#6ee7b7','#34d399']

export const pieColors = dark => (dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT)

// Recharts' default Tooltip "cursor" for a BarChart is a flat grey/white rectangle spanning
// the hovered bar's full column — it isn't theme-aware, so it reads as a jarring white flash
// against this app's colored cards. Pass to <Tooltip cursor={barCursor} /> on any BarChart.
export const barCursor = { fill: 'var(--input-bg)' }

// Sorts { name, value } pie entries largest-first, so the biggest category is always at the
// top of any legend/key built from the same data, and slices go largest-to-smallest starting
// at 12 o'clock — the conventional, most readable pie ordering.
export const sortByValueDesc = (data) => [...data].sort((a, b) => b.value - a.value)

// Slice divider — theme-aware so slices always get a clean, visible gap between them, whether
// or not one is being hovered. In light mode the palette is all blue shades, so a blue divider
// (matching the card surface) blended into the slices themselves and only looked "present" on
// the hovered/enlarged slice, which used a black outline instead — giving the illusion the
// border only exists on hover. Black divides the blue slices clearly in every state; dark
// mode's near-black card already contrasts fine against the green palette, so it's unchanged.
export const pieStrokeProps = (dark) => ({
  stroke: dark ? 'var(--card-bg-solid)' : '#000',
  strokeWidth: 1.5,
})

export const pieTooltipStyle = dark => ({
  background: dark ? '#111' : '#fff',
  border: '1px solid var(--card-border)',
  borderRadius: 10,
  color: 'var(--positive)',
  fontSize: 13,
})
export const pieTooltipItemStyle  = { color: 'var(--positive)' }
export const pieTooltipLabelStyle = { color: 'var(--positive)' }

// Renders the hovered/tapped slice slightly larger — the visual "this one" indicator used by
// every pie chart in the app. Pair with a Cell fillOpacity of pieCellOpacity(activeIndex, i) so
// the other slices dim while one is active, and with onMouseEnter/onMouseLeave/onClick handlers
// that track an `activeIndex` state (hover on desktop, tap-to-toggle on touch devices).
//
// In light mode the palette leans on pale blues, which can visually blend into the card
// background right at the slice's own outer edge — a solid black outline keeps the active
// slice readable there. Dark mode's fills already read clearly against the near-black card,
// so it keeps the same subtle card-matching border the inactive slices use.
// Usage: activeShape={renderActivePieSector(dark)}
export const renderActivePieSector = (dark) => (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx} cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      {...pieStrokeProps(dark)}
      strokeWidth={dark ? 1.5 : 2}
    />
  )
}

// Full opacity for the active slice (or all slices when none is active), dimmed otherwise.
export const pieCellOpacity = (activeIndex, i) =>
  activeIndex == null || activeIndex === i ? 1 : 0.45

// Recharts' default <Legend> colors each label's TEXT in that series' own line/fill color
// (not the page's text color) — several of this app's series colors (e.g. the light-mode
// "Income"/"Expenses" line colors) have very poor contrast against the card background as a
// result. This keeps the colored dot for visual association but always renders the label
// itself in the theme's readable primary text color. Usage: <Legend content={renderLegend} />
export const renderLegend = (props) => {
  const { payload } = props
  if (!payload) return null
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
      {payload.map((entry, i) => (
        <li key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-primary)' }}>{entry.value}</span>
        </li>
      ))}
    </ul>
  )
}
