import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { stocksApi } from '../api.js'
import { Button, Card, Empty, Field, Input, Pill } from '../components/ui.jsx'
import { fmtNum, fmtPct, fmtPrice, tone, toneBg } from '../lib/format.js'
import AllocationPie, { COLORS } from '../components/AllocationPie.jsx'
import PriceChart from '../components/PriceChart.jsx'

const LS_KEY = 'portfolio.holdings.v1'
const loadHoldings = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || []
  } catch {
    return []
  }
}
const currencyOf = (symbol, fallback) =>
  /\.(KS|KQ)$/i.test(symbol) ? 'KRW' : fallback || 'USD'

export default function Portfolio() {
  const [holdings, setHoldings] = useState(loadHoldings)
  const [quotes, setQuotes] = useState({})
  const [fx, setFx] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(holdings))
  }, [holdings])

  async function refresh() {
    if (!holdings.length) {
      setQuotes({})
      return
    }
    setLoading(true)
    try {
      const symbols = [...new Set([...holdings.map((h) => h.symbol), 'USDKRW=X'])]
      const list = await stocksApi.quote(symbols)
      const map = {}
      for (const q of list) map[q.symbol] = q
      setQuotes(map)
      if (map['USDKRW=X']?.price) setFx(map['USDKRW=X'].price)
    } catch {
      /* 네트워크 오류는 조용히 무시하고 다음 주기에 재시도 */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length])

  const toKRW = (value, currency) =>
    currency === 'KRW' ? value : value * (fx || 0)

  const rows = useMemo(
    () =>
      holdings.map((h) => {
        const q = quotes[h.symbol]
        const price = q?.price ?? null
        const value = price != null ? price * h.qty : null
        const cost = h.avgPrice * h.qty
        const pnl = value != null ? value - cost : null
        const pnlPct = value != null && cost ? (pnl / cost) * 100 : null
        return {
          ...h,
          price,
          value,
          cost,
          pnl,
          pnlPct,
          dayPct: q?.changePercent ?? null,
          valueKRW: value != null ? toKRW(value, h.currency) : 0,
          costKRW: toKRW(cost, h.currency),
        }
      }),
    [holdings, quotes, fx],
  )

  const totalValueKRW = rows.reduce((s, r) => s + (r.valueKRW || 0), 0)
  const totalCostKRW = rows.reduce((s, r) => s + (r.costKRW || 0), 0)
  const totalPnlKRW = totalValueKRW - totalCostKRW
  const totalPnlPct = totalCostKRW ? (totalPnlKRW / totalCostKRW) * 100 : 0

  const pieData = rows
    .filter((r) => r.valueKRW > 0)
    .map((r) => ({ name: r.symbol, value: r.valueKRW }))
    .sort((a, b) => b.value - a.value)

  const addHolding = (h) => {
    setHoldings((prev) => [...prev, { id: crypto.randomUUID(), ...h }])
    setShowAdd(false)
  }
  const removeHolding = (id) => {
    setHoldings((prev) => prev.filter((x) => x.id !== id))
    if (selected && !holdings.find((h) => h.id !== id && h.symbol === selected)) setSelected(null)
  }

  return (
    <div className="space-y-5">
      {/* 요약 */}
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-400">총 평가금액 (원화 환산)</div>
            <div className="tnum mt-1 text-3xl font-bold">{fmtNum(Math.round(totalValueKRW))}원</div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className={`tnum font-semibold ${tone(totalPnlKRW)}`}>
                {totalPnlKRW >= 0 ? '+' : ''}
                {fmtNum(Math.round(totalPnlKRW))}원
              </span>
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${toneBg(totalPnlPct)}`}>
                {fmtPct(totalPnlPct)}
              </span>
            </div>
          </div>
          <Button variant="ghost" onClick={refresh} title="새로고침">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
        {fx && (
          <div className="mt-3 text-xs text-slate-500">
            환율 적용: 1 USD = {fmtNum(Math.round(fx))}원 · 30초마다 자동 갱신
          </div>
        )}
      </Card>

      {/* 차트 영역 */}
      {rows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <div className="mb-2 text-sm font-medium text-slate-300">자산 배분</div>
            <AllocationPie data={pieData} />
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {pieData.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1 text-xs text-slate-400">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  {d.name}
                </span>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            {selected ? (
              <PriceChart
                symbol={selected}
                currency={holdings.find((h) => h.symbol === selected)?.currency}
              />
            ) : (
              <Empty>종목을 선택하면 차트가 표시됩니다</Empty>
            )}
          </Card>
        </div>
      )}

      {/* 보유 종목 */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">보유 종목 {rows.length > 0 && `(${rows.length})`}</h2>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> 종목 추가
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card className="p-4">
          <Empty>
            <div>아직 보유 종목이 없습니다.</div>
            <Button variant="primary" onClick={() => setShowAdd(true)}>
              <Plus size={16} /> 첫 종목 추가하기
            </Button>
          </Empty>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card
              key={r.id}
              className={`cursor-pointer p-4 transition hover:bg-white/[0.05] ${
                selected === r.symbol ? 'ring-1 ring-indigo-400/60' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3" onClick={() => setSelected(r.symbol)}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.symbol}</span>
                    <Pill tone={r.currency === 'KRW' ? 'blue' : 'indigo'}>{r.currency}</Pill>
                  </div>
                  <div className="truncate text-xs text-slate-400">{r.name}</div>
                  <div className="tnum mt-1 text-xs text-slate-500">
                    {fmtNum(r.qty, r.qty % 1 ? 4 : 0)}주 · 평단 {fmtPrice(r.avgPrice, r.currency)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum font-semibold">{fmtPrice(r.value, r.currency)}</div>
                  <div className="mt-0.5 flex items-center justify-end gap-1.5">
                    <span className={`tnum text-sm font-medium ${tone(r.pnlPct)}`}>{fmtPct(r.pnlPct)}</span>
                  </div>
                  <div className="tnum mt-0.5 text-xs text-slate-500">
                    현재가 {fmtPrice(r.price, r.currency)}
                    {r.dayPct != null && (
                      <span className={`ml-1 ${tone(r.dayPct)}`}>({fmtPct(r.dayPct)})</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeHolding(r.id)
                  }}
                  className="rounded-lg p-2 text-slate-500 hover:bg-white/10 hover:text-rose-400"
                  title="삭제"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd && <AddHolding onAdd={addHolding} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function AddHolding({ onAdd, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(null)
  const [pickedQuote, setPickedQuote] = useState(null)
  const [qty, setQty] = useState('')
  const [avg, setAvg] = useState('')
  const timer = useRef(null)

  useEffect(() => {
    if (picked || q.trim().length < 1) {
      setResults([])
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        setResults(await stocksApi.search(q.trim()))
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(timer.current)
  }, [q, picked])

  async function pick(r) {
    setPicked(r)
    setResults([])
    setQ(r.symbol)
    try {
      const [quote] = await stocksApi.quote([r.symbol])
      setPickedQuote(quote)
      if (quote?.price) setAvg(String(quote.price))
    } catch {
      /* ignore */
    }
  }

  const currency = picked ? currencyOf(picked.symbol, pickedQuote?.currency) : 'USD'
  const canAdd = picked && Number(qty) > 0 && Number(avg) > 0

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <Card
        className="w-full max-w-md rounded-b-none bg-[#0e1320] p-5 sm:rounded-b-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">종목 추가</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <Field label="종목 검색 (한국·미국 주식)">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-500" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPicked(null)
                setPickedQuote(null)
              }}
              placeholder="예: 삼성전자, AAPL, Tesla, 005930.KS"
              className="pl-9"
            />
          </div>
        </Field>

        {results.length > 0 && (
          <div className="mt-1 max-h-56 overflow-auto rounded-xl border border-white/10 bg-[#0b0f17]">
            {results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => pick(r)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="font-medium">{r.symbol}</span>
                  <span className="ml-2 truncate text-xs text-slate-400">{r.name}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">{r.exchange}</span>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
              <span className="font-semibold">{picked.symbol}</span>
              <Pill tone={currency === 'KRW' ? 'blue' : 'indigo'}>{currency}</Pill>
              {pickedQuote?.price && (
                <span className="tnum ml-auto text-slate-300">
                  현재가 {fmtPrice(pickedQuote.price, currency)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="보유 수량">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="평균 매입가">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={avg}
                  onChange={(e) => setAvg(e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
            <Button
              variant="primary"
              className="w-full"
              disabled={!canAdd}
              onClick={() =>
                onAdd({
                  symbol: picked.symbol,
                  name: picked.name,
                  currency,
                  qty: Number(qty),
                  avgPrice: Number(avg),
                })
              }
            >
              추가하기
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
