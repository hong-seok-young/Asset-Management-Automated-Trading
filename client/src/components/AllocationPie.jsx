import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fmtNum } from '../lib/format.js'

const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#f97316',
]

function TooltipBox({ active, payload, total }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const pct = total ? ((p.value / total) * 100).toFixed(1) : '0'
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b0f17] px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-slate-200">{p.name}</div>
      <div className="text-slate-400">
        {fmtNum(Math.round(p.value))}원 · {pct}%
      </div>
    </div>
  )
}

export default function AllocationPie({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!data.length || total <= 0) return null
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={92}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipBox total={total} />} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export { COLORS }
