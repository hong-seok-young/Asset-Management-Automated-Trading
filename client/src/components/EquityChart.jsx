import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtNum } from '../lib/format.js'

export default function EquityChart({ data }) {
  // data: [{ time, equity }]
  const rows = data.map((d) => ({ t: new Date(d.time).toLocaleDateString('ko-KR'), equity: d.equity }))
  if (!rows.length) return null
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={rows} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 11 }} minTickGap={50} />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: '#64748b', fontSize: 11 }}
          width={60}
          tickFormatter={(v) => fmtNum(Math.round(v))}
        />
        <Tooltip
          contentStyle={{
            background: '#0b0f17',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(v) => [fmtNum(Math.round(v)), '평가금']}
        />
        <Line type="monotone" dataKey="equity" stroke="#818cf8" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
