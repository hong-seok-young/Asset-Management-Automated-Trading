import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const stocksApi = {
  quote: (symbols) =>
    api.get('/stocks/quote', { params: { symbols: symbols.join(',') } }).then((r) => r.data),
  search: (q) => api.get('/stocks/search', { params: { q } }).then((r) => r.data),
  chart: (symbol, range = '1mo') =>
    api.get('/stocks/chart', { params: { symbol, range } }).then((r) => r.data),
}

export const cryptoApi = {
  status: () => api.get('/crypto/status').then((r) => r.data),
  ticker: (exchange, symbol) =>
    api.get('/crypto/ticker', { params: { exchange, symbol } }).then((r) => r.data),
  ohlcv: (exchange, symbol, timeframe = '1h', limit = 200) =>
    api.get('/crypto/ohlcv', { params: { exchange, symbol, timeframe, limit } }).then((r) => r.data),
  balance: (exchange) => api.get('/crypto/balance', { params: { exchange } }).then((r) => r.data),
  backtest: (body) => api.post('/crypto/backtest', body).then((r) => r.data),
  bots: () => api.get('/crypto/bots').then((r) => r.data),
  createBot: (body) => api.post('/crypto/bots', body).then((r) => r.data),
  updateBot: (id, body) => api.patch(`/crypto/bots/${id}`, body).then((r) => r.data),
  removeBot: (id) => api.delete(`/crypto/bots/${id}`).then((r) => r.data),
  runBot: (id) => api.post(`/crypto/bots/${id}/run`).then((r) => r.data),
  trades: (botId) =>
    api.get('/crypto/trades', { params: botId ? { botId } : {} }).then((r) => r.data),
  logs: () => api.get('/crypto/logs').then((r) => r.data),
}
