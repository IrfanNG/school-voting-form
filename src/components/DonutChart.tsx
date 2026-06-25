import type { TotalsRow } from '../types'

const COLORS = ['#f6c138', '#1f4e8c', '#4caf7b', '#ef8033', '#8a5cc7', '#3aa9a1']
const OTHER_COLOR = '#b6b3a7'

interface Segment {
  schoolName: string
  count: number
  percent: number
  color: string
}

function buildSegments(totals: TotalsRow[]): Segment[] {
  const sorted = [...totals].sort((a, b) => b.count - a.count)
  const top = sorted.slice(0, 6)
  const rest = sorted.slice(6)
  const restCount = rest.reduce((sum, r) => sum + r.count, 0)
  const segments: Segment[] = top.map((t, i) => ({
    schoolName: t.schoolName,
    count: t.count,
    percent: 0,
    color: COLORS[i] ?? OTHER_COLOR,
  }))
  if (restCount > 0) {
    segments.push({
      schoolName: 'Others',
      count: restCount,
      percent: 0,
      color: OTHER_COLOR,
    })
  }
  const total = segments.reduce((s, x) => s + x.count, 0) || 1
  segments.forEach((s) => (s.percent = (s.count / total) * 100))
  return segments
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const
}

function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
): string {
  const largeArc = end - start > Math.PI ? 1 : 0
  const [x1, y1] = polar(cx, cy, rOuter, start)
  const [x2, y2] = polar(cx, cy, rOuter, end)
  const [x3, y3] = polar(cx, cy, rInner, end)
  const [x4, y4] = polar(cx, cy, rInner, start)
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}

interface Props {
  totals: TotalsRow[]
}

export default function DonutChart({ totals }: Props) {
  if (!totals.length || totals.every((t) => t.count === 0)) {
    return <p className="muted">No votes yet.</p>
  }

  const segments = buildSegments(totals)
  const size = 220
  const cx = size / 2
  const cy = size / 2
  const rOuter = 100
  const rInner = 62
  let acc = -Math.PI / 2

  return (
    <div className="analytics">
      <div className="donut-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
          aria-label={summary(segments)}>
          {segments.map((s, i) => {
            const start = acc
            const sweep = (s.percent / 100) * 2 * Math.PI
            const end = start + sweep
            acc = end
            const path = arcPath(cx, cy, rOuter, rInner, start, s.percent >= 100 ? start + 2 * Math.PI - 0.0001 : end)
            return <path key={i} d={path} fill={s.color} stroke="#fff" strokeWidth={1.5} />
          })}
          <text x={cx} y={cy - 4} textAnchor="middle" className="donut-num">
            {segments.reduce((x, s) => x + s.count, 0)}
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" className="donut-label">
            votes
          </text>
        </svg>
        <p className="muted small donut-summary">{summary(segments)}</p>
      </div>

      <ol className="rank-list" aria-label="Top schools ranking">
        {segments.map((s, i) => (
          <li key={s.schoolName} className="rank-row">
            <span className="rank-dot" style={{ background: s.color }} />
            <span className="rank-name">{s.schoolName}</span>
            <span className="rank-count">{s.count}</span>
            <span className="rank-pct muted small">{s.percent.toFixed(1)}%</span>
            {i === 0 && <span className="crown">★</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

function summary(segments: Segment[]): string {
  if (!segments.length) return 'No votes yet.'
  const top = segments[0]
  return `Top school is ${top.schoolName} with ${top.count} votes.`
}