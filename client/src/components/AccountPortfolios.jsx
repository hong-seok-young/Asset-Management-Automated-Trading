import { useEffect, useMemo, useState } from 'react'
import { Coins, Landmark, PiggyBank, RefreshCw, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import { Card, Pill } from './ui.jsx'
import InfoTip from './InfoTip.jsx'
import { fmtNum } from '../lib/format.js'
import { stocksApi } from '../api.js'
import {
  BASE_ACCOUNTS,
  DEFAULT_PRICE,
  EXPLAIN,
  KLASS,
  MODES,
  REGIME_LABEL,
  blendedExpense,
  blendedReturn,
  classifyRegime,
  regimeSummary,
  tiltAccount,
} from '../lib/portfolios.js'

const ACCOUNT_ICON = { pension: PiggyBank, pensionExtra: PiggyBank, irp: Landmark, isa: TrendingUp, cma: Wallet }
const LEVEL_TONE = { high: 'amber', low: 'blue', mid: 'slate' }
const LEVELS = ['low', 'mid', 'high']

// 국내상장 ETF 티커(6자리) → Yahoo 심볼(.KS). 시세 자동조회용.
const toYahoo = (ticker) => `${ticker}.KS`

// 신호 1개 카드 (값 + 상태 배지 + 설명 팝업 + 수동 조정 select)
function SignalCard({ icon: Icon, label, explainKey, regimeKey, item, override, onOverride, fmtVal }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-400">
        <Icon size={13} className="text-slate-400" /> {label}
        <InfoTip title={EXPLAIN[explainKey].title} body={EXPLAIN[explainKey].body} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="tnum text-base font-semibold text-slate-100">{item?.value != null ? fmtVal(item.value) : '—'}</span>
        {(override ?? item?.level) && <Pill tone={LEVEL_TONE[override ?? item.level]}>{REGIME_LABEL[regimeKey][override ?? item.level]}</Pill>}
      </div>
      <select
        value={override ?? ''}
        onChange={(e) => onOverride(e.target.value || null)}
        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-indigo-400"
      >
        <option value="">자동 판정{item?.level ? ` (${REGIME_LABEL[regimeKey][item.level]})` : ''}</option>
        {LEVELS.map((lv) => (
          <option key={lv} value={lv}>
            직접: {REGIME_LABEL[regimeKey][lv]}
          </option>
        ))}
      </select>
    </div>
  )
}

// 종목 1줄: 비중/보수/연평균 + 현재가·주수 입력·매수금액
function HoldingRow({ r, monthly, showTrade, onShares, onPrice }) {
  const { h, price, hasAuto, rec, sharesVal, buy, target } = r
  const km = KLASS[h.klass]
  const explain = EXPLAIN[h.klass]
  const up = h.delta > 0
  return (
    <div className="border-t border-white/5 py-2 first:border-0">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: km?.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-slate-100">{h.name}</span>
            {explain && <InfoTip title={explain.title} body={explain.body} />}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {h.ticker} · {h.role} · 보수 {h.expense < 0.01 ? h.expense.toFixed(4) : h.expense.toFixed(2)}% · 연평균 ~{h.annualReturn}%
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum text-sm font-semibold text-slate-100">
            {h.weight}%
            {h.delta !== 0 && (
              <span className={`ml-1 text-[11px] font-medium ${up ? 'text-rose-400' : 'text-sky-400'}`}>
                {up ? '▲' : '▼'}
                {Math.abs(h.delta)}
              </span>
            )}
          </div>
          {target > 0 && <div className="tnum text-[11px] text-slate-500">목표 {fmtNum(target)}원</div>}
        </div>
      </div>

      {showTrade && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-4 text-[11px]">
          {hasAuto ? (
            <span className="text-slate-400">
              현재가 <b className="tnum text-slate-200">{fmtNum(Math.round(price))}</b>원
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-400">
              현재가
              <input
                inputMode="numeric"
                value={onPrice.value}
                onChange={(e) => onPrice.set(e.target.value)}
                placeholder="직접"
                className="tnum w-16 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-right text-slate-100 outline-none focus:border-indigo-400"
              />
              원
            </span>
          )}
          <span className="text-slate-500">×</span>
          <input
            inputMode="numeric"
            value={sharesVal}
            onChange={(e) => onShares(e.target.value)}
            className="tnum w-14 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-right text-slate-100 outline-none focus:border-indigo-400"
          />
          <span className="text-slate-400">주</span>
          {price > 0 && (
            <span className="tnum font-medium text-slate-200">= {fmtNum(Math.round(buy))}원</span>
          )}
          {price > 0 && target > 0 && <span className="text-slate-600">(추천 {rec}주)</span>}
        </div>
      )}
    </div>
  )
}

export default function AccountPortfolios({ alloc }) {
  const [signals, setSignals] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [mode, setMode] = useState('balanced')
  const [override, setOverride] = useState({ fx: null, val: null, rate: null })

  const [quotes, setQuotes] = useState({}) // { [ticker]: 현재가 } 시세 자동조회 결과
  // 현재가 직접 입력값 — 시세 서버가 없을 때를 대비해 조회한 기본값으로 미리 채워둔다.
  const [priceOv, setPriceOv] = useState(() => Object.fromEntries(Object.entries(DEFAULT_PRICE).map(([k, v]) => [k, String(v)])))
  const [shares, setShares] = useState({}) // { [acc:ticker]: '주수' }
  const [touched, setTouched] = useState(() => new Set()) // 사용자가 직접 만진 주수 키

  const fetchAll = async () => {
    setLoading(true)
    setErr(null)
    const tickers = [...new Set(BASE_ACCOUNTS.flatMap((a) => a.holdings.map((h) => h.ticker)))]
    const [sig, quoteRes] = await Promise.allSettled([stocksApi.marketSignals(), stocksApi.quote(tickers.map(toYahoo))])
    if (sig.status === 'fulfilled') setSignals(sig.value)
    else setErr(sig.reason?.response?.data?.error || sig.reason?.message || '조회 실패')
    if (quoteRes.status === 'fulfilled') {
      const map = {}
      for (const q of quoteRes.value || []) {
        const base = String(q.symbol || '').replace(/\.KS$/, '')
        if (q.price != null) map[base] = q.price
      }
      setQuotes(map)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const autoRegime = useMemo(() => classifyRegime(signals || {}), [signals])
  const regime = useMemo(
    () => ({
      fx: override.fx ? { level: override.fx, value: autoRegime.fx?.value } : autoRegime.fx,
      val: override.val ? { level: override.val, value: autoRegime.val?.value } : autoRegime.val,
      rate: override.rate ? { level: override.rate, value: autoRegime.rate?.value } : autoRegime.rate,
    }),
    [autoRegime, override],
  )
  const summary = regimeSummary(regime)
  const setOv = (k) => (v) => setOverride((o) => ({ ...o, [k]: v }))
  const noLevels = !regime.fx && !regime.val && !regime.rate
  const showFallback = !loading && noLevels && (err || signals)

  // 시세 자동조회가 있으면 그것을, 없으면 직접 입력값(기본값 시드 포함)을 쓴다.
  const effPrice = (ticker) => {
    if (quotes[ticker] != null) return quotes[ticker]
    const ov = Number(priceOv[ticker])
    return ov > 0 ? ov : null
  }
  const onShares = (key) => (v) => {
    const d = v.replace(/[^\d]/g, '')
    setTouched((prev) => new Set(prev).add(key))
    setShares((s) => ({ ...s, [key]: d }))
  }
  const onPrice = (ticker) => ({
    value: priceOv[ticker] ?? '',
    set: (v) => setPriceOv((p) => ({ ...p, [ticker]: v.replace(/[^\d.]/g, '') })),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Coins size={16} className="text-amber-300" />
        <h4 className="text-sm font-semibold">현 시장 국면</h4>
        <InfoTip title={EXPLAIN.rebalance.title} body={EXPLAIN.rebalance.body} />
        {summary && <Pill tone="indigo">{summary}</Pill>}
        <button
          onClick={fetchAll}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/15 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {loading ? '조회 중' : '시세 새로고침'}
        </button>
      </div>

      {/* 신호 카드 3 */}
      <div className="grid gap-2.5 sm:grid-cols-3">
        <SignalCard icon={Coins} label="원/달러 환율" explainKey="fx" regimeKey="fx" item={regime.fx} override={override.fx} onOverride={setOv('fx')} fmtVal={(v) => `${fmtNum(Math.round(v))}원`} />
        <SignalCard icon={TrendingUp} label="미국지수 (52주 고점대비)" explainKey="val" regimeKey="val" item={regime.val} override={override.val} onOverride={setOv('val')} fmtVal={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`} />
        <SignalCard icon={Landmark} label="미국채 10년 금리" explainKey="rate" regimeKey="rate" item={regime.rate} override={override.rate} onOverride={setOv('rate')} fmtVal={(v) => `${v.toFixed(2)}%`} />
      </div>
      {showFallback && (
        <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          시세 자동조회를 못 가져왔어요{err ? ` (${err})` : ''}. 국면은 각 카드 드롭다운으로, 현재가는 종목별 칸에 직접 입력하면 주수·금액이 계산돼요.
        </div>
      )}

      {/* 모드 선택 + 자동 버튼 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] text-slate-400">
          리밸런싱 모드
          <InfoTip title={EXPLAIN.mode.title} body={EXPLAIN.mode.body} />
        </span>
        <div className="inline-flex overflow-hidden rounded-xl border border-white/10">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              title={m.desc}
              className={`px-3 py-1.5 text-xs font-medium transition ${mode === m.key ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/10'}`}
            >
              {m.name}
              {m.recommended ? ' ★' : ''}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setOverride({ fx: null, val: null, rate: null })
            setMode('balanced')
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
        >
          <Sparkles size={14} /> 자동으로 맞춰줘
        </button>
      </div>
      <p className="text-[11px] text-slate-500">{MODES.find((m) => m.key === mode)?.desc} · 비중은 “이번 달 새로 넣는 돈”을 이렇게 나누라는 의미예요(전량 매도 아님). 국내 ETF는 소수점 매매가 안 돼서 정수 주수로 담아요.</p>

      {/* 계좌별 종목 */}
      <div className="grid gap-3 lg:grid-cols-2">
        {BASE_ACCOUNTS.map((acc) => {
          const Icon = ACCOUNT_ICON[acc.key] || PiggyBank
          const tilted = tiltAccount(acc, regime, mode)
          const monthly = Math.round(alloc?.[acc.key] || 0)
          const exp = blendedExpense(tilted)
          const ret = blendedReturn(tilted)
          const showTrade = monthly > 0 && acc.key !== 'cma'

          const rows = tilted.map((h) => {
            const key = `${acc.key}:${h.ticker}`
            const price = effPrice(h.ticker)
            const target = monthly > 0 ? Math.round((monthly * h.weight) / 100) : 0
            const rec = price > 0 ? Math.floor(target / price) : 0
            const sharesVal = touched.has(key) ? shares[key] ?? '' : String(rec)
            const sNum = Number(sharesVal) || 0
            return { h, key, price, hasAuto: quotes[h.ticker] != null, target, rec, sharesVal, sNum, buy: price > 0 ? sNum * price : 0 }
          })
          const invested = rows.reduce((s, r) => s + r.buy, 0)
          const anyPrice = rows.some((r) => r.price > 0)
          const leftover = monthly - invested

          return (
            <Card key={acc.key} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon size={16} className="shrink-0 text-slate-300" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{acc.name}</div>
                    <div className="truncate text-[11px] text-slate-500">{acc.note}</div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {monthly > 0 ? (
                    <div className="tnum text-xs font-semibold text-slate-200">월 {fmtNum(monthly)}원</div>
                  ) : (
                    <div className="text-[11px] text-slate-500">배분액 0</div>
                  )}
                  <div className="text-[10px] text-slate-500">평균보수 {exp < 0.01 ? exp.toFixed(4) : exp.toFixed(2)}%</div>
                  {acc.key !== 'cma' && <div className="text-[10px] text-emerald-400/80">기대수익 ~{ret.toFixed(1)}%</div>}
                </div>
              </div>
              <div className="mt-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-[10px] text-slate-500">📌 {acc.constraint}</div>
              <div className="mt-1.5">
                {rows.map((r) => (
                  <HoldingRow key={r.h.ticker + r.h.klass} r={r} monthly={monthly} showTrade={showTrade} onShares={onShares(r.key)} onPrice={onPrice(r.h.ticker)} />
                ))}
              </div>
              {showTrade && anyPrice && (
                <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-[11px]">
                  <span className="text-slate-400">
                    매수 합계 <b className="tnum text-slate-200">{fmtNum(Math.round(invested))}</b>원
                  </span>
                  <span className={leftover < 0 ? 'text-rose-400' : 'text-slate-500'}>
                    {leftover < 0 ? '월 배분 초과 ' : '남는 현금 '}
                    <b className="tnum">{fmtNum(Math.abs(Math.round(leftover)))}</b>원
                  </span>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        ※ 공격형·사회초년생 기준 <b>참고용 예시</b>이며 투자자문이 아닙니다. 현재가는 시세 서버 연결 시 자동 갱신되고, 없으면 <b>2026-06 조회 근사치</b>가 미리 채워져 있어요(소수점 매매 불가 → 정수 주수). 실제 매수 전 증권사 현재가로 확인·수정하세요. 보수율·연평균·세제 한도도 추정값입니다.
      </p>
    </div>
  )
}
