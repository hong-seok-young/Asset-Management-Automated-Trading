import { useEffect, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { stocksApi } from '../api.js'
import { fmtPrice } from '../lib/format.js'

const RANGES = ['5d', '1mo', '3mo', '6mo', '1y']

export default function PriceChart({ symbol, currency }) {
  const [data, setData] = useState([])
  const [range, setRange] = useState('3mo')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    stocksApi
      .chart(symbol, range)
      .then((rows) => {
        if (!alive) return
        setData(
          rows.map((r) => ({
            date: r.date.slice(0, 10),
            close: r.close,
          })),
        )
      })
      .catch(() => alive && setData([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [symbol, range])

  const up = data.length > 1 && data[data.length - 1].close >= data[0].close
  const color = up ? '#fb7185' : '#38bdf8' // 한국식: 상승 빨강, 하락 파랑

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{symbol} 차트</span>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-2 py-1 text-xs ${
                range === r ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} minTickGap={40} />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: '#64748b', fontSize: 11 }}
            width={55}
            tickFormatter={(v) => fmtPrice(v, currency)}
          />
          <Tooltip
            contentStyle={{
              background: '#0b0f17',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(v) => [fmtPrice(v, currency), '종가']}
          />
          <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#pc)" />
        </AreaChart>
      </ResponsiveContainer>
      {loading && <div className="mt-1 text-center text-xs text-slate-500">불러오는 중…</div>}
    </div>
  )
}
