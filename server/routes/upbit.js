import { Router } from 'express'
import { fetchAccounts, fetchPrices } from '../services/upbit.js'

const router = Router()

// POST /api/upbit/accounts   body: { jwt }
// 무상태: 클라가 시크릿으로 서명한 토큰으로 잔고를 중계한다. 서버는 키·토큰을 저장하지 않는다.
router.post('/accounts', async (req, res) => {
  try {
    const { jwt } = req.body || {}
    res.json(await fetchAccounts(jwt))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// GET /api/upbit/prices?markets=KRW-BTC,KRW-ETH   (공개 시세, KRW 환산용)
router.get('/prices', async (req, res) => {
  try {
    const markets = String(req.query.markets || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    res.json(await fetchPrices(markets))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

export default router
