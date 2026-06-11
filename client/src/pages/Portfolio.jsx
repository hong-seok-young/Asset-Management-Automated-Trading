import { useEffect, useMemo, useRef, useState } from 'react'
import { KeyRound, Lock, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { stocksApi } from '../api.js'
import { Button, Card, Empty, Field, Input, Pill } from '../components/ui.jsx'
import { fmtNum, fmtPct, fmtPrice, tone, toneBg } from '../lib/format.js'
import {
  clearCreds,
  currentMock,
  hasStoredCreds,
  isUnlocked,
  lock,
  saveCreds,
  testConnection,
  unlock,
} from '../lib/kiwoom.js'
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
  const [showKiwoom, setShowKiwoom] = useState(false)
  const [kiwoomStored, setKiwoomStored] = useState(hasStoredCreds())
  const [kiwoomUnlocked, setKiwoomUnlocked] = useState(isUnlocked())
  const syncKiwoomState = () => {
    setKiwoomStored(hasStoredCreds())
    setKiwoomUnlocked(isUnlocked())
  }

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
          <div className="flex items-center gap-2">
            <Button
              variant={kiwoomStored ? 'ghost' : 'default'}
              onClick={() => setShowKiwoom(true)}
            >
              {kiwoomStored && !kiwoomUnlocked ? <Lock size={14} /> : <KeyRound size={14} />}
              {!kiwoomStored ? '키움 연동' : kiwoomUnlocked ? '키움 연결됨' : '키움 잠김'}
            </Button>
            <Button variant="ghost" onClick={refresh} title="새로고침">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
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
      {showKiwoom && (
        <KiwoomConnect onClose={() => setShowKiwoom(false)} onChange={syncKiwoomState} />
      )}
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

function KiwoomConnect({ onClose, onChange }) {
  const stored = hasStoredCreds()
  const [unlocked, setUnlocked] = useState(isUnlocked())
  // setup: 저장된 키 없음 / unlock: 저장됨+잠김 / ready: 저장됨+해제됨
  const mode = !stored ? 'setup' : unlocked ? 'ready' : 'unlock'

  const [appkey, setAppkey] = useState('')
  const [secretkey, setSecretkey] = useState('')
  const [mock, setMock] = useState(true)
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [unlockPass, setUnlockPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function testAndSave() {
    if (!appkey.trim() || !secretkey.trim()) {
      setMsg({ ok: false, text: 'App Key와 Secret Key를 모두 입력하세요' })
      return
    }
    if (pass1.length < 4) {
      setMsg({ ok: false, text: '잠금 암호를 4자 이상 입력하세요' })
      return
    }
    if (pass1 !== pass2) {
      setMsg({ ok: false, text: '잠금 암호가 서로 다릅니다' })
      return
    }
    setBusy(true)
    setMsg(null)
    const creds = { appkey: appkey.trim(), secretkey: secretkey.trim(), mock }
    try {
      await testConnection(creds)
      await saveCreds(creds, pass1)
      setUnlocked(true)
      setMsg({ ok: true, text: '연결 성공! 키를 암호로 잠가 저장했습니다.' })
      onChange?.()
      setTimeout(onClose, 800)
    } catch (e) {
      setMsg({ ok: false, text: e?.response?.data?.error || e.message || '연결 실패' })
    } finally {
      setBusy(false)
    }
  }

  async function doUnlock() {
    if (!unlockPass) {
      setMsg({ ok: false, text: '암호를 입력하세요' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await unlock(unlockPass)
      setUnlocked(true)
      setMsg({ ok: true, text: '잠금 해제됨. 이제 조회할 수 있습니다.' })
      onChange?.()
      setTimeout(onClose, 700)
    } catch (e) {
      setMsg({ ok: false, text: e.message || '잠금 해제 실패' })
    } finally {
      setBusy(false)
    }
  }

  function doLock() {
    lock()
    setUnlocked(false)
    setUnlockPass('')
    setMsg({ ok: true, text: '잠갔습니다. 다시 쓰려면 암호를 입력하세요.' })
    onChange?.()
  }

  function unlink() {
    clearCreds()
    setUnlocked(false)
    onChange?.()
    onClose()
  }

  const seg = (active) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
      active ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
    }`

  const title =
    mode === 'setup' ? '키움증권 연동' : mode === 'unlock' ? '키움 잠금 해제' : '키움 연동됨'

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md rounded-b-none bg-[#0e1320] p-5 sm:rounded-b-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          {mode === 'setup' && (
            <>
              <Field label="App Key">
                <Input
                  value={appkey}
                  onChange={(e) => setAppkey(e.target.value)}
                  placeholder="키움 발급 App Key"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Secret Key">
                <Input
                  type="password"
                  value={secretkey}
                  onChange={(e) => setSecretkey(e.target.value)}
                  placeholder="키움 발급 Secret Key"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="모드">
                <div className="flex gap-2">
                  <button type="button" className={seg(mock)} onClick={() => setMock(true)}>
                    모의투자
                  </button>
                  <button type="button" className={seg(!mock)} onClick={() => setMock(false)}>
                    실전투자
                  </button>
                </div>
              </Field>
              {!mock && (
                <div className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-300">
                  ⚠️ 실전투자 키입니다. 조회만 해도 실제 계좌 정보가 오갑니다.
                </div>
              )}
              <Field label="잠금 암호" hint="키를 풀 때 쓰는 암호. 복구 불가하니 잊지 마세요.">
                <Input
                  type="password"
                  value={pass1}
                  onChange={(e) => setPass1(e.target.value)}
                  placeholder="4자 이상"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="잠금 암호 확인">
                <Input
                  type="password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  placeholder="한 번 더"
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}

          {mode === 'unlock' && (
            <>
              <p className="text-xs text-slate-400">
                저장된 키움 키가 암호로 잠겨 있습니다. 암호를 입력해 잠금을 해제하세요.
              </p>
              <Field label="잠금 암호">
                <Input
                  type="password"
                  value={unlockPass}
                  onChange={(e) => setUnlockPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doUnlock()}
                  placeholder="저장할 때 정한 암호"
                  autoComplete="off"
                  autoFocus
                />
              </Field>
            </>
          )}

          {mode === 'ready' && (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
              ✅ 연결됨 · 잠금 해제 상태{' '}
              <Pill tone={currentMock() ? 'amber' : 'indigo'} className="ml-1">
                {currentMock() ? '모의투자' : '실전투자'}
              </Pill>
              <p className="mt-1 text-[11px] text-emerald-300/70">
                새로고침하면 다시 암호를 입력해야 합니다.
              </p>
            </div>
          )}

          {msg && (
            <div
              className={`rounded-lg px-3 py-2 text-xs ${
                msg.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {msg.text}
            </div>
          )}

          {mode === 'setup' && (
            <Button variant="primary" className="w-full" disabled={busy} onClick={testAndSave}>
              {busy ? '연결 확인 중…' : '연결 테스트 후 저장'}
            </Button>
          )}
          {mode === 'unlock' && (
            <>
              <Button variant="primary" className="w-full" disabled={busy} onClick={doUnlock}>
                {busy ? '여는 중…' : '잠금 해제'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={unlink}>
                연동 해제 (저장된 키 삭제)
              </Button>
            </>
          )}
          {mode === 'ready' && (
            <>
              <Button variant="default" className="w-full" onClick={doLock}>
                잠그기
              </Button>
              <Button variant="ghost" className="w-full" onClick={unlink}>
                연동 해제 (저장된 키 삭제)
              </Button>
            </>
          )}

          <p className="text-[11px] leading-relaxed text-slate-500">
            🔒 키는 <b>암호로 암호화되어 이 브라우저에만</b> 저장됩니다(서버 저장 안 함). 공용 PC에서는
            사용하지 마세요. 키는{' '}
            <a
              href="https://openapi.kiwoom.com"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-300 underline"
            >
              키움 REST API
            </a>{' '}
            에서 발급합니다.
          </p>
        </div>
      </Card>
    </div>
  )
}
