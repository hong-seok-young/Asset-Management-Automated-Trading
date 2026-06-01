import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import cryptoRouter from './routes/crypto.js'
import stocksRouter from './routes/stocks.js'
import { startEngine } from './services/trader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }))
app.use('/api/stocks', stocksRouter)
app.use('/api/crypto', cryptoRouter)

// ── 빌드된 프론트(client/dist) 서빙 — 단일 서비스(앱+API 한 주소) ──
// 빌드가 있을 때만 켠다. (개발 중엔 Vite:5173 을 쓰므로 dist 가 없어도 정상)
const clientDist = path.resolve(__dirname, '../client/dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  // SPA 폴백: /api 로 시작하지 않는 GET 요청은 index.html 로 (react-router 처리)
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`▶ 서버 실행 중: http://localhost:${PORT}`)
  startEngine()
})
