import cron from 'node-cron'
import { randomUUID } from 'node:crypto'
import { createMarketOrder, fetchOHLCV, hasKeys, isTestnet } from './exchanges.js'
import { evaluateStrategy, STRATEGY_DEFAULTS } from './strategy.js'
import { readJSON, writeJSON } from './store.js'

const LIMITS = {
  maxOrderUsdt: Number(process.env.MAX_ORDER_USDT || 100),
  maxOrderKrw: Number(process.env.MAX_ORDER_KRW || 100000),
  maxTradesPerDay: Number(process.env.MAX_TRADES_PER_DAY || 10),
}
const DEFAULT_MODE = (process.env.TRADE_MODE || 'paper').toLowerCase() === 'live' ? 'live' : 'paper'
const FEE_RATE = 0.0005

let bots = readJSON('bots.json', [])
let trades = readJSON('trades.json', [])
let logs = readJSON('logs.json', [])

const persistBots = () => writeJSON('bots.json', bots)
const persistTrades = () => writeJSON('trades.json', (trades = trades.slice(-500)))
const persistLogs = () => writeJSON('logs.json', (logs = logs.slice(-200)))

function addLog(entry) {
  logs.push({ id: randomUUID(), time: Date.now(), ...entry })
  persistLogs()
}

function quoteOf(symbol) {
  return (symbol.split('/')[1] || 'USDT').toUpperCase()
}

function orderLimitFor(quote) {
  return quote === 'KRW' ? LIMITS.maxOrderKrw : LIMITS.maxOrderUsdt
}

function tradesTodayForBot(botId) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const t0 = start.getTime()
  return trades.filter((t) => t.botId === botId && t.time >= t0).length
}

function publicBot(b) {
  return {
    ...b,
    inPosition: b.holding.base > 0,
    keysReady: hasKeys(b.exchange),
    testnet: isTestnet(b.exchange),
  }
}

// ───────────────────────── CRUD ─────────────────────────

export function listBots() {
  return bots.map(publicBot)
}

export function getBot(id) {
  const b = bots.find((x) => x.id === id)
  return b ? publicBot(b) : null
}

export async function runById(id, opts) {
  const b = bots.find((x) => x.id === id)
  if (!b) return null
  const result = await runBotOnce(b, opts)
  return { result, bot: publicBot(b) }
}

export function addBot(input) {
  const exchange = input.exchange === 'upbit' ? 'upbit' : 'binance'
  const symbol = String(input.symbol || (exchange === 'upbit' ? 'BTC/KRW' : 'BTC/USDT')).toUpperCase()
  const quote = quoteOf(symbol)
  const type = input.strategy?.type === 'ma_cross' ? 'ma_cross' : 'rsi'
  const strategy = { ...STRATEGY_DEFAULTS[type], ...input.strategy, type }
  const defaultCash = quote === 'KRW' ? 1_000_000 : 1000
  const orderSize = Math.min(Number(input.orderSize) || defaultCash / 5, orderLimitFor(quote))

  const bot = {
    id: randomUUID(),
    name: input.name || `${symbol} ${type.toUpperCase()}`,
    exchange,
    symbol,
    quote,
    timeframe: input.timeframe || '1h',
    strategy,
    orderSize,
    mode: input.mode === 'live' ? 'live' : 'paper',
    enabled: false,
    holding: { base: 0, entryPrice: 0 },
    paperCash: Number(input.initialPaperCash) || defaultCash,
    initialPaperCash: Number(input.initialPaperCash) || defaultCash,
    lastCandleTime: 0,
    lastSignal: null,
    lastReason: null,
    lastRun: null,
    createdAt: Date.now(),
  }
  bots.push(bot)
  persistBots()
  addLog({ botId: bot.id, level: 'info', message: `봇 생성: ${bot.name}` })
  return publicBot(bot)
}

export function updateBot(id, patch) {
  const b = bots.find((x) => x.id === id)
  if (!b) return null
  if (patch.name != null) b.name = patch.name
  if (patch.timeframe != null) b.timeframe = patch.timeframe
  if (patch.orderSize != null) b.orderSize = Math.min(Number(patch.orderSize), orderLimitFor(b.quote))
  if (patch.strategy != null) b.strategy = { ...b.strategy, ...patch.strategy }
  if (patch.mode != null) b.mode = patch.mode === 'live' ? 'live' : 'paper'
  if (patch.enabled != null) b.enabled = !!patch.enabled
  persistBots()
  addLog({ botId: b.id, level: 'info', message: `봇 수정: ${b.name}` })
  return publicBot(b)
}

export function removeBot(id) {
  const before = bots.length
  bots = bots.filter((x) => x.id !== id)
  persistBots()
  return bots.length < before
}

export function getTrades(botId) {
  const list = botId ? trades.filter((t) => t.botId === botId) : trades
  return [...list].reverse()
}

export function getLogs() {
  return [...logs].reverse()
}

export function getStatus() {
  return {
    defaultMode: DEFAULT_MODE,
    limits: LIMITS,
    feeRate: FEE_RATE,
    exchanges: {
      binance: { keysReady: hasKeys('binance'), testnet: isTestnet('binance') },
      upbit: { keysReady: hasKeys('upbit'), testnet: false },
    },
    botCount: bots.length,
    enabledCount: bots.filter((b) => b.enabled).length,
  }
}

// ─────────────────────── 매매 실행 ───────────────────────

async function executeBuy(bot, price) {
  const limit = orderLimitFor(bot.quote)
  const spend = Math.min(bot.orderSize, limit, bot.mode === 'paper' ? bot.paperCash : Infinity)
  if (spend <= 0) {
    addLog({ botId: bot.id, level: 'warn', message: '매수 자금 부족 — 건너뜀' })
    return null
  }

  if (bot.mode === 'live') {
    if (!hasKeys(bot.exchange)) {
      addLog({ botId: bot.id, level: 'error', message: '실거래 불가: API 키 없음' })
      return null
    }
    const baseAmount = spend / price
    const order = await createMarketOrder(bot.exchange, bot.symbol, 'buy', { baseAmount, quoteAmount: spend })
    const filled = order.amount || baseAmount
    bot.holding.entryPrice =
      bot.holding.base > 0
        ? (bot.holding.entryPrice * bot.holding.base + price * filled) / (bot.holding.base + filled)
        : price
    bot.holding.base += filled
    return record(bot, 'buy', price, filled, spend)
  }

  // paper
  const fee = spend * FEE_RATE
  const base = (spend - fee) / price
  bot.holding.entryPrice =
    bot.holding.base > 0
      ? (bot.holding.entryPrice * bot.holding.base + price * base) / (bot.holding.base + base)
      : price
  bot.holding.base += base
  bot.paperCash -= spend
  return record(bot, 'buy', price, base, spend)
}

async function executeSell(bot, price) {
  const base = bot.holding.base
  if (base <= 0) return null

  if (bot.mode === 'live') {
    if (!hasKeys(bot.exchange)) {
      addLog({ botId: bot.id, level: 'error', message: '실거래 불가: API 키 없음' })
      return null
    }
    const order = await createMarketOrder(bot.exchange, bot.symbol, 'sell', { baseAmount: base })
    const filled = order.amount || base
    const proceeds = filled * price
    const pnl = (price - bot.holding.entryPrice) * filled
    bot.holding = { base: 0, entryPrice: 0 }
    return record(bot, 'sell', price, filled, proceeds, pnl)
  }

  // paper
  const proceeds = base * price
  const fee = proceeds * FEE_RATE
  const pnl = (price - bot.holding.entryPrice) * base - fee
  bot.paperCash += proceeds - fee
  bot.holding = { base: 0, entryPrice: 0 }
  return record(bot, 'sell', price, base, proceeds - fee, pnl)
}

function record(bot, side, price, amount, quoteAmount, pnl) {
  const trade = {
    id: randomUUID(),
    time: Date.now(),
    botId: bot.id,
    botName: bot.name,
    exchange: bot.exchange,
    symbol: bot.symbol,
    mode: bot.mode,
    side,
    price,
    amount,
    quoteAmount,
    pnl: pnl ?? null,
    reason: bot.lastReason,
  }
  trades.push(trade)
  persistTrades()
  addLog({
    botId: bot.id,
    level: 'trade',
    message: `${bot.mode === 'paper' ? '[모의] ' : '[실거래] '}${side === 'buy' ? '매수' : '매도'} ${bot.symbol} @ ${price} (${bot.lastReason})`,
  })
  return trade
}

// ───────────────────── 봇 1회 실행 ─────────────────────

export async function runBotOnce(bot, { force = false } = {}) {
  const need =
    bot.strategy.type === 'ma_cross'
      ? (bot.strategy.slow ?? 30) + 5
      : (bot.strategy.period ?? 14) + 5
  const candles = await fetchOHLCV(bot.exchange, bot.symbol, bot.timeframe, Math.max(60, need + 30))
  // 마지막 캔들은 아직 형성 중 → 제외하고 '확정 캔들'로만 판단
  const closed = candles.slice(0, -1)
  if (closed.length < 2) return { signal: 'hold', reason: '데이터 부족' }

  const lastClosed = closed[closed.length - 1]
  bot.lastRun = Date.now()

  // 같은 캔들에서 중복 실행 방지
  if (!force && lastClosed.timestamp === bot.lastCandleTime) {
    return { signal: bot.lastSignal, reason: bot.lastReason, skipped: 'same-candle' }
  }
  bot.lastCandleTime = lastClosed.timestamp

  const result = evaluateStrategy(bot.strategy, closed)
  bot.lastSignal = result.signal
  bot.lastReason = result.reason

  let trade = null
  const inPosition = bot.holding.base > 0
  if (result.signal === 'buy' && !inPosition) {
    if (tradesTodayForBot(bot.id) >= LIMITS.maxTradesPerDay) {
      addLog({ botId: bot.id, level: 'warn', message: '일일 매매 한도 도달 — 매수 보류' })
    } else {
      trade = await executeBuy(bot, lastClosed.close)
    }
  } else if (result.signal === 'sell' && inPosition) {
    trade = await executeSell(bot, lastClosed.close)
  }

  persistBots()
  return { ...result, trade }
}

// ───────────────────── 엔진 (cron) ─────────────────────

let ticking = false
async function tick() {
  if (ticking) return
  ticking = true
  try {
    for (const bot of bots.filter((b) => b.enabled)) {
      try {
        await runBotOnce(bot)
      } catch (err) {
        addLog({ botId: bot.id, level: 'error', message: `실행 오류: ${err.message}` })
      }
    }
  } finally {
    ticking = false
  }
}

export function startEngine() {
  // 매 분마다 점검 (실제 매매는 새 확정 캔들이 생길 때만 1회)
  cron.schedule('* * * * *', tick)
  addLog({ level: 'info', message: `엔진 시작 — 기본 모드: ${DEFAULT_MODE}` })
  // 시작 직후 1회
  tick()
}
