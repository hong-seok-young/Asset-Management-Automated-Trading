import { rsi, sma } from './indicators.js'

// candles: [{ timestamp, open, high, low, close, volume }]
// 반환: { signal: 'buy'|'sell'|'hold', reason, indicators }
export function evaluateStrategy(strategy, candles) {
  const closes = candles.map((c) => c.close)

  if (strategy.type === 'rsi') {
    const period = strategy.period ?? 14
    const oversold = strategy.oversold ?? 30
    const overbought = strategy.overbought ?? 70
    const series = rsi(closes, period)
    const cur = series[series.length - 1]
    if (cur == null) return { signal: 'hold', reason: '데이터 부족', indicators: {} }
    if (cur <= oversold)
      return { signal: 'buy', reason: `RSI ${cur.toFixed(1)} ≤ ${oversold} 과매도`, indicators: { rsi: cur } }
    if (cur >= overbought)
      return { signal: 'sell', reason: `RSI ${cur.toFixed(1)} ≥ ${overbought} 과매수`, indicators: { rsi: cur } }
    return { signal: 'hold', reason: `RSI ${cur.toFixed(1)} 중립`, indicators: { rsi: cur } }
  }

  if (strategy.type === 'ma_cross') {
    const fast = strategy.fast ?? 10
    const slow = strategy.slow ?? 30
    const fastMa = sma(closes, fast)
    const slowMa = sma(closes, slow)
    const i = closes.length - 1
    const f0 = fastMa[i]
    const s0 = slowMa[i]
    const f1 = fastMa[i - 1]
    const s1 = slowMa[i - 1]
    if ([f0, s0, f1, s1].some((v) => v == null))
      return { signal: 'hold', reason: '데이터 부족', indicators: {} }
    const ind = { fastMa: f0, slowMa: s0 }
    if (f1 <= s1 && f0 > s0)
      return { signal: 'buy', reason: `골든크로스 MA${fast}↗MA${slow}`, indicators: ind }
    if (f1 >= s1 && f0 < s0)
      return { signal: 'sell', reason: `데드크로스 MA${fast}↘MA${slow}`, indicators: ind }
    return { signal: 'hold', reason: `추세유지 MA${fast} ${f0 > s0 ? '>' : '<'} MA${slow}`, indicators: ind }
  }

  return { signal: 'hold', reason: '알 수 없는 전략 유형', indicators: {} }
}

export const STRATEGY_DEFAULTS = {
  rsi: { type: 'rsi', period: 14, oversold: 30, overbought: 70 },
  ma_cross: { type: 'ma_cross', fast: 10, slow: 30 },
}
