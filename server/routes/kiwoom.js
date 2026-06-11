import { Router } from 'express'
import { fetchBalanceRaw, issueToken } from '../services/kiwoom.js'

const router = Router()

// POST /api/kiwoom/token   body: { appkey, secretkey, mock }
// 무상태: 발급한 토큰을 서버에 저장하지 않고 그대로 돌려준다. (클라가 보관)
router.post('/token', async (req, res) => {
  try {
    const { appkey, secretkey, mock } = req.body || {}
    res.json(await issueToken({ appkey, secretkey, mock: !!mock }))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// POST /api/kiwoom/balance   body: { token, mock, body, contYn, nextKey }
// kt00018 계좌평가잔고내역. 지금은 키움 원본(raw)을 그대로 반환(필드 확정 전).
router.post('/balance', async (req, res) => {
  try {
    const { token, mock, body, contYn, nextKey } = req.body || {}
    res.json(await fetchBalanceRaw({ token, mock: !!mock, body, contYn, nextKey }))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

export default router
