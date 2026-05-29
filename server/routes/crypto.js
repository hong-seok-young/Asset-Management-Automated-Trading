import { Router } from 'express'
import { backtest } from '../services/backtest.js'
import { fetchBalance, fetchOHLCV, fetchTicker } from '../services/exchanges.js'
import * as trader from '../services/trader.js'

const router = Router()

router.get('/status', (req, res) => res.json(trader.getStatus()))

router.get('/ticker', async (req, res) => {
  try {
    const { exchange = 'binance', symbol = 'BTC/USDT' } = req.query
    res.json(await fetchTicker(exchange, symbol))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/ohlcv', async (req, res) => {
  try {
    const { exchange = 'binance', symbol = 'BTC/USDT', timeframe = '1h', limit = 200 } = req.query
    res.json(await fetchOHLCV(exchange, symbol, timeframe, Number(limit)))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/balance', async (req, res) => {
  try {
    const { exchange = 'binance' } = req.query
    res.json(await fetchBalance(exchange))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/backtest', async (req, res) => {
  try {
    const { exchange = 'binance', symbol = 'BTC/USDT', timeframe = '1h', strategy, initialCash, limit = 500 } = req.body || {}
    if (!strategy?.type) return res.status(400).json({ error: 'strategy 가 필요합니다' })
    const candles = await fetchOHLCV(exchange, symbol, timeframe, Number(limit))
    res.json(backtest(strategy, candles, { initialCash: Number(initialCash) || 1_000_000 }))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── 봇 관리 ──
router.get('/bots', (req, res) => res.json(trader.listBots()))

router.post('/bots', (req, res) => res.json(trader.addBot(req.body || {})))

router.patch('/bots/:id', (req, res) => {
  const b = trader.updateBot(req.params.id, req.body || {})
  if (!b) return res.status(404).json({ error: '봇을 찾을 수 없습니다' })
  res.json(b)
})

router.delete('/bots/:id', (req, res) => res.json({ ok: trader.removeBot(req.params.id) }))

router.post('/bots/:id/run', async (req, res) => {
  try {
    const out = await trader.runById(req.params.id, { force: true })
    if (!out) return res.status(404).json({ error: '봇을 찾을 수 없습니다' })
    res.json(out)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/trades', (req, res) => res.json(trader.getTrades(req.query.botId)))
router.get('/logs', (req, res) => res.json(trader.getLogs()))

export default router
