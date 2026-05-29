// Yahoo Finance 공개 엔드포인트를 직접 호출한다.
// (yahoo-finance2 라이브러리는 quote 시 crumb 발급에서 429가 자주 떠서 사용하지 않음.
//  v8 chart / v1 search 엔드포인트는 crumb 없이 동작한다.)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const BASES = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']

async function fetchJson(path) {
  let lastErr
  for (const base of BASES) {
    try {
      const r = await fetch(base + path, { headers: { 'User-Agent': UA } })
      if (!r.ok) {
        lastErr = new Error(`Yahoo ${r.status}`)
        continue
      }
      return await r.json()
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('Yahoo 요청 실패')
}

function rangeForQuote() {
  return 'range=5d&interval=1d'
}

export async function getQuotes(symbols) {
  if (!symbols || !symbols.length) return []
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const data = await fetchJson(
          `/v8/finance/chart/${encodeURIComponent(symbol)}?${rangeForQuote()}`,
        )
        const result = data?.chart?.result?.[0]
        if (!result) return { symbol, error: '조회 실패' }
        const m = result.meta || {}
        const price = m.regularMarketPrice ?? null
        const prev = m.previousClose ?? m.chartPreviousClose ?? null
        const change = price != null && prev != null ? price - prev : null
        return {
          symbol,
          name: m.longName || m.shortName || m.symbol || symbol,
          price,
          previousClose: prev,
          change,
          changePercent: change != null && prev ? (change / prev) * 100 : null,
          currency: m.currency || null,
          marketState: m.marketState || null,
          exchange: m.fullExchangeName || m.exchangeName || null,
        }
      } catch (e) {
        return { symbol, error: e.message }
      }
    }),
  )
  return results
}

export async function searchSymbols(query) {
  // /v1/finance/search 는 한글(비ASCII) 쿼리에 400 "Invalid Search Query" 를 반환한다.
  // /v6/finance/autocomplete 는 한글 회사명·영어·티커를 모두 지원하고 한글 종목명도 돌려준다.
  // lang=ko-KR&region=KR 이어야 한글 회사명("카카오","삼성")이 매칭된다. (영어/티커는 무관하게 동작)
  const data = await fetchJson(
    `/v6/finance/autocomplete?query=${encodeURIComponent(query)}&lang=ko-KR&region=KR`,
  )
  return (data?.ResultSet?.Result || [])
    .filter((q) => q.symbol && q.type !== 'Option')
    .map((q) => ({
      symbol: q.symbol,
      name: q.name || q.symbol,
      exchange: q.exchDisp || q.exch || '',
      type: q.typeDisp || q.type || '',
    }))
}

const RANGE_TO_PARAMS = {
  '5d': { range: '5d', interval: '15m' },
  '1mo': { range: '1mo', interval: '1d' },
  '3mo': { range: '3mo', interval: '1d' },
  '6mo': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1d' },
  '2y': { range: '2y', interval: '1wk' },
}

export async function getChart(symbol, range = '1mo', interval) {
  const preset = RANGE_TO_PARAMS[range] || RANGE_TO_PARAMS['1mo']
  const iv = interval || preset.interval
  const data = await fetchJson(
    `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${preset.range}&interval=${iv}`,
  )
  const result = data?.chart?.result?.[0]
  if (!result) return []
  const ts = result.timestamp || []
  const q = result.indicators?.quote?.[0] || {}
  const out = []
  for (let i = 0; i < ts.length; i++) {
    if (q.close?.[i] == null) continue
    out.push({
      date: new Date(ts[i] * 1000).toISOString(),
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close: q.close[i],
      volume: q.volume?.[i] ?? null,
    })
  }
  return out
}
