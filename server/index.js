import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import cryptoRouter from './routes/crypto.js'
import stocksRouter from './routes/stocks.js'
import { startEngine } from './services/trader.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }))
app.use('/api/stocks', stocksRouter)
app.use('/api/crypto', cryptoRouter)

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`▶ 서버 실행 중: http://localhost:${PORT}`)
  startEngine()
})
