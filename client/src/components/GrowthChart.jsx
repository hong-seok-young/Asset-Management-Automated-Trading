import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtNum } from '../lib/format.js'

// data: [{ year, principal, profit }] — 누적 원금 + 운용수익을 쌓으면 총 평가액
export default function GrowthChart({ data }) {
  if (!data?.length) return null
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gPrincipal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.08} />
          </linearGradient>
          <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.12} />
          </linearGradient>
        </defs>
        <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `${v}년`} minTickGap={24} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} width={46} tickFormatter={(v) => fmtNum(Math.round(v / 10000)) + '만'} />
        <Tooltip
          contentStyle={{ background: '#0b0f17', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={(v) => `${v}년 후`}
          formatter={(v, n) => [fmtNum(Math.round(v)) + '원', n]}
        />
        <Area type="monotone" dataKey="principal" name="원금" stackId="1" stroke="#818cf8" fill="url(#gPrincipal)" strokeWidth={2} />
        <Area type="monotone" dataKey="profit" name="수익" stackId="1" stroke="#34d399" fill="url(#gProfit)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
