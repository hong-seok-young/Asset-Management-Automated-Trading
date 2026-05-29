import { useEffect, useState } from 'react'
import { Play, TrendingUp } from 'lucide-react'
import { cryptoApi } from '../api.js'
import { Button, Card, Field, Input, Select } from './ui.jsx'
import { fmtNum, fmtPct, fmtPrice, tone } from '../lib/format.js'
import { EXCHANGE_LABEL, MARKETS, TIMEFRAMES } from '../lib/markets.js'
import StrategyEditor from './StrategyEditor.jsx'
import EquityChart from './EquityChart.jsx'

function Metric({ label, children, className = '' }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`tnum text-lg font-bold ${className}`}>{children}</div>
    </div>
  )
}

export default function BacktestPanel() {
  const [exchange, setExchange] = useState('binance')
  const [symbol, setSymbol] = useState('BTC/USDT')
  const [timeframe, setTimeframe] = useState('1h')
  const [strategy, setStrategy] = useState({ type: 'rsi', period: 14, oversold: 30, overbought: 70 })
  const [initialCash, setInitialCash] = useState(1000000)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [ticker, setTicker] = useState(null)

  useEffect(() => {
    setSymbol(MARKETS[exchange][0])
  }, [exchange])

  useEffect(() => {
    let alive = true
    setTicker(null)
    cryptoApi
      .ticker(exchange, symbol)
      .then((t) => alive && setTicker(t))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [exchange, symbol])

  async function run() {
    setLoading(true)
    setError(null)
    try {
      setResult(
        await cryptoApi.backtest({
          exchange,
          symbol,
          timeframe,
          strategy,
          initialCash: Number(initialCash),
          limit: 500,
        }),
      )
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const quote = symbol.split('/')[1]

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-indigo-400" />
        <h2 className="text-base font-semibold">백테스트</h2>
        <span className="text-xs text-slate-500">과거 데이터로 전략을 검증 (실거래 아님)</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="거래소">
              <Select value={exchange} onChange={(e) => setExchange(e.target.value)}>
                <option value="binance">바이낸스</option>
                <option value="upbit">업비트</option>
              </Select>
            </Field>
            <Field label="종목">
              <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {MARKETS[exchange].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="봉 주기">
              <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                {TIMEFRAMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="초기 자본">
              <Input
                type="number"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
              />
            </Field>
          </div>
          <StrategyEditor value={strategy} onChange={setStrategy} />
          <Button variant="primary" className="w-full" onClick={run} disabled={loading}>
            <Play size={16} /> {loading ? '실행 중…' : '백테스트 실행'}
          </Button>
          {ticker?.last != null && (
            <div className="text-center text-xs text-slate-500">
              현재 {symbol} 시세: <span className="tnum text-slate-300">{fmtPrice(ticker.last, quote)}</span>
            </div>
          )}
          {error && <div className="text-center text-xs text-rose-400">{error}</div>}
        </div>

        <div>
          {result && !result.error ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="전략 수익률" className={tone(result.totalReturn)}>
                  {fmtPct(result.totalReturn * 100)}
                </Metric>
                <Metric label="단순보유 수익률" className={tone(result.buyHoldReturn)}>
                  {fmtPct(result.buyHoldReturn * 100)}
                </Metric>
                <Metric label="매매 횟수">{result.tradeCount}회</Metric>
                <Metric label="승률">{fmtNum(result.winRate * 100, 0)}%</Metric>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <div className="text-[11px] text-slate-400">최종 평가금</div>
                <div className="tnum text-lg font-bold">{fmtNum(Math.round(result.finalEquity))}</div>
              </div>
              <EquityChart data={result.equityCurve} />
            </div>
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-500">
              {result?.error || '설정 후 백테스트를 실행하세요'}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
