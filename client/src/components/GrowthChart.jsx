import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtNum } from '../lib/format.js'

// data: [{ x, total, principal }]
//  - x         : 가로축 값 (나이 또는 연차)
//  - total     : 총 자산(운용수익 + 목돈지출 반영)
//  - principal : 누적 저축원금(목돈지출 차감)
// xUnit  : '세'(나이) 또는 '년'(연차)
// target : 목표 금액(원, 0이면 숨김)  → 가로 점선
// reachX : 목표 달성 가로축 값          → 세로 실선(🎯)
// lumpXs : 목돈 지출 가로축 값[]        → 세로 점선(빨강)
export default function GrowthChart({ data, xUnit = '년', target = 0, reachX = null, lumpXs = [] }) {
  if (!data?.length) return null
  const man = (v) => fmtNum(Math.round(v / 10000)) + '만'
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.06} />
          </linearGradient>
        </defs>
        <XAxis dataKey="x" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `${v}${xUnit}`} minTickGap={22} />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          width={48}
          domain={[(min) => Math.min(0, min), (max) => Math.max(max, target > 0 ? target * 1.08 : max)]}
          tickFormatter={(v) => fmtNum(Math.round(v / 10000)) + '만'}
        />
        <Tooltip
          contentStyle={{ background: '#0b0f17', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
          labelFormatter={(v) => (xUnit === '세' ? `만 ${v}세` : `${v}년 후`)}
          formatter={(v, n) => [fmtNum(Math.round(v)) + '원', n]}
        />

        {/* 목돈 지출 시점 */}
        {lumpXs.map((x, i) => (
          <ReferenceLine key={`lump-${i}`} x={x} stroke="#f43f5e" strokeDasharray="2 3" strokeOpacity={0.55} />
        ))}

        {/* 목표 금액 */}
        {target > 0 && (
          <ReferenceLine
            y={target}
            stroke="#f59e0b"
            strokeDasharray="5 4"
            label={{ value: `목표 ${man(target)}`, fill: '#f59e0b', fontSize: 11, position: 'insideTopLeft' }}
          />
        )}

        {/* 목표 달성 시점 */}
        {reachX != null && (
          <ReferenceLine
            x={reachX}
            stroke="#34d399"
            label={{ value: '🎯 달성', fill: '#34d399', fontSize: 11, position: 'top' }}
          />
        )}

        <Area type="monotone" dataKey="total" name="총 자산" stroke="#34d399" fill="url(#gTotal)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="principal" name="누적 저축원금" stroke="#818cf8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
