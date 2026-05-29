import { evaluateStrategy } from './strategy.js'

// 과거 캔들에 전략을 적용해 매매를 시뮬레이션한다.
export function backtest(strategy, candles, { initialCash = 1_000_000, feeRate = 0.0005 } = {}) {
  let cash = initialCash
  let position = 0
  let entryPrice = 0
  const trades = []
  const equityCurve = []

  const warmup =
    strategy.type === 'ma_cross' ? (strategy.slow ?? 30) + 1 : (strategy.period ?? 14) + 1

  if (candles.length <= warmup + 1) {
    return { error: '캔들 데이터가 부족합니다', initialCash, finalEquity: initialCash, totalReturn: 0, buyHoldReturn: 0, tradeCount: 0, winRate: 0, trades: [], equityCurve: [] }
  }

  for (let i = warmup; i < candles.length; i++) {
    const window = candles.slice(0, i + 1)
    const { signal, reason } = evaluateStrategy(strategy, window)
    const price = candles[i].close

    if (signal === 'buy' && position === 0) {
      const fee = cash * feeRate
      position = (cash - fee) / price
      entryPrice = price
      cash = 0
      trades.push({ time: candles[i].timestamp, side: 'buy', price, amount: position, reason })
    } else if (signal === 'sell' && position > 0) {
      const proceeds = position * price
      const fee = proceeds * feeRate
      const pnl = (price - entryPrice) * position - fee
      cash = proceeds - fee
      trades.push({ time: candles[i].timestamp, side: 'sell', price, amount: position, reason, pnl })
      position = 0
    }
    equityCurve.push({ time: candles[i].timestamp, equity: cash + position * price })
  }

  const finalPrice = candles[candles.length - 1].close
  const finalEquity = cash + position * finalPrice
  const firstPrice = candles[warmup].close
  const sells = trades.filter((t) => t.side === 'sell')
  const wins = sells.filter((t) => t.pnl > 0).length

  return {
    initialCash,
    finalEquity,
    totalReturn: (finalEquity - initialCash) / initialCash,
    buyHoldReturn: (finalPrice - firstPrice) / firstPrice,
    tradeCount: trades.length,
    winRate: sells.length ? wins / sells.length : 0,
    trades,
    equityCurve,
  }
}
