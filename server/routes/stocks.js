import { Router } from 'express'
import { getChart, getMarketSignals, getQuotes, searchSymbols } from '../services/yahoo.js'

const router = Router()

// GET /api/stocks/quote?symbols=AAPL,005930.KS
router.get('/quote', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    res.json(await getQuotes(symbols))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/stocks/search?q=samsung
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    res.json(q ? await searchSymbols(q) : [])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/stocks/market-signals — 환율·미국지수·미국채금리 (리밸런싱 국면 판정용)
router.get('/market-signals', async (req, res) => {
  try {
    res.json(await getMarketSignals())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/stocks/chart?symbol=AAPL&range=1mo&interval=1d
router.get('/chart', async (req, res) => {
  try {
    const { symbol, range, interval } = req.query
    if (!symbol) return res.status(400).json({ error: 'symbol 파라미터가 필요합니다' })
    res.json(await getChart(symbol, range, interval))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
