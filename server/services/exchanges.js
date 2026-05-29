import ccxt from 'ccxt'

const cfg = {
  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    secret: process.env.BINANCE_SECRET || '',
    testnet: String(process.env.BINANCE_TESTNET || 'true').toLowerCase() === 'true',
  },
  upbit: {
    apiKey: process.env.UPBIT_API_KEY || '',
    secret: process.env.UPBIT_SECRET || '',
  },
}

const cache = {}

function build(id, { trading }) {
  let ex
  if (id === 'binance') {
    ex = new ccxt.binance({
      apiKey: trading ? cfg.binance.apiKey || undefined : undefined,
      secret: trading ? cfg.binance.secret || undefined : undefined,
      enableRateLimit: true,
      options: { defaultType: 'spot' },
    })
    // 주문·잔고용 인스턴스만 테스트넷. 시세/캔들은 항상 실거래소(실제 시장 데이터).
    if (trading && cfg.binance.testnet) ex.setSandboxMode(true)
  } else if (id === 'upbit') {
    ex = new ccxt.upbit({
      apiKey: trading ? cfg.upbit.apiKey || undefined : undefined,
      secret: trading ? cfg.upbit.secret || undefined : undefined,
      enableRateLimit: true,
    })
  } else {
    throw new Error(`지원하지 않는 거래소: ${id}`)
  }
  return ex
}

// 시세/캔들 등 공개 데이터용 (키 없음, 테스트넷 아님)
function getPublicExchange(id) {
  const key = `pub:${id}`
  if (!cache[key]) cache[key] = build(id, { trading: false })
  return cache[key]
}

// 주문/잔고용 (키 사용, 바이낸스는 설정 시 테스트넷)
export function getExchange(id) {
  const key = `trade:${id}`
  if (!cache[key]) cache[key] = build(id, { trading: true })
  return cache[key]
}

export function hasKeys(id) {
  const c = cfg[id]
  return !!(c && c.apiKey && c.secret)
}

export function isTestnet(id) {
  return id === 'binance' ? cfg.binance.testnet : false
}

export async function fetchTicker(id, symbol) {
  const t = await getPublicExchange(id).fetchTicker(symbol)
  return {
    symbol: t.symbol,
    last: t.last,
    bid: t.bid,
    ask: t.ask,
    high: t.high,
    low: t.low,
    percentage: t.percentage,
    baseVolume: t.baseVolume,
    timestamp: t.timestamp,
  }
}

export async function fetchOHLCV(id, symbol, timeframe = '1h', limit = 200) {
  const raw = await getPublicExchange(id).fetchOHLCV(symbol, timeframe, undefined, limit)
  return raw.map(([timestamp, open, high, low, close, volume]) => ({
    timestamp,
    open,
    high,
    low,
    close,
    volume,
  }))
}

export async function fetchBalance(id) {
  if (!hasKeys(id)) throw new Error(`${id} API 키가 설정되지 않았습니다`)
  const bal = await getExchange(id).fetchBalance()
  const out = []
  for (const [coin, total] of Object.entries(bal.total || {})) {
    if (total && total > 0) {
      out.push({ coin, free: bal.free?.[coin] ?? 0, used: bal.used?.[coin] ?? 0, total })
    }
  }
  return out.sort((a, b) => b.total - a.total)
}

// side: 'buy' | 'sell'
export async function createMarketOrder(id, symbol, side, { baseAmount, quoteAmount }) {
  const ex = getExchange(id)
  if (side === 'buy' && id === 'upbit') {
    // 업비트 시장가 매수는 '금액(quote)' 기준
    return ex.createOrder(symbol, 'market', 'buy', quoteAmount, undefined, {
      createMarketBuyOrderRequiresPrice: false,
    })
  }
  return ex.createOrder(symbol, 'market', side, baseAmount)
}
