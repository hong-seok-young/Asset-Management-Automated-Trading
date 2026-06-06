import { useEffect, useMemo, useState } from 'react'
import { Coins, Landmark, PiggyBank, RefreshCw, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import { Card, Pill } from './ui.jsx'
import InfoTip from './InfoTip.jsx'
import { fmtNum } from '../lib/format.js'
import { stocksApi } from '../api.js'
import {
  BASE_ACCOUNTS,
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

// 신호 1개 카드 (값 + 상태 배지 + 설명 팝업 + 수동 조정 select)
function SignalCard({ icon: Icon, label, explainKey, regimeKey, item, override, onOverride, fmtVal }) {
  const level = override ?? item?.level ?? null
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-400">
        <Icon size={13} className="text-slate-400" /> {label}
        <InfoTip title={EXPLAIN[explainKey].title} body={EXPLAIN[explainKey].body} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="tnum text-base font-semibold text-slate-100">{item?.value != null ? fmtVal(item.value) : '—'}</span>
        {level && <Pill tone={LEVEL_TONE[level]}>{REGIME_LABEL[regimeKey][level]}</Pill>}
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

function HoldingRow({ h, monthly }) {
  const km = KLASS[h.klass]
  const explain = EXPLAIN[h.klass]
  const buy = monthly > 0 ? Math.round((monthly * h.weight) / 100) : 0
  const up = h.delta > 0
  return (
    <div className="flex items-center gap-2 border-t border-white/5 py-2 first:border-0">
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
        {buy > 0 && <div className="tnum text-[11px] text-slate-500">월 {fmtNum(buy)}원</div>}
      </div>
    </div>
  )
}

export default function AccountPortfolios({ alloc }) {
  const [signals, setSignals] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [mode, setMode] = useState('balanced')
  const [override, setOverride] = useState({ fx: null, val: null, rate: null })

  const fetchSignals = async () => {
    setLoading(true)
    setErr(null)
    try {
      setSignals(await stocksApi.marketSignals())
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSignals()
  }, [])

  const autoRegime = useMemo(() => classifyRegime(signals || {}), [signals])
  // 자동 판정 위에 사용자의 수동 조정(override)을 덮어쓴다.
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
  // 자동조회가 비었고(시세 차단 등) 수동 조정도 없으면 폴백 안내를 띄운다.
  const noLevels = !regime.fx && !regime.val && !regime.rate
  const showFallback = !loading && noLevels && (err || signals)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Coins size={16} className="text-amber-300" />
        <h4 className="text-sm font-semibold">현 시장 국면</h4>
        <InfoTip title={EXPLAIN.rebalance.title} body={EXPLAIN.rebalance.body} />
        {summary && <Pill tone="indigo">{summary}</Pill>}
        <button
          onClick={fetchSignals}
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
          시세 자동조회를 못 가져왔어요{err ? ` (${err})` : ''}. 각 카드의 드롭다운으로 현 상황(높음/보통/낮음)을 직접 골라도 비중이 계산돼요.
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
            if (!signals) fetchSignals()
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
        >
          <Sparkles size={14} /> 자동으로 맞춰줘
        </button>
      </div>
      <p className="text-[11px] text-slate-500">{MODES.find((m) => m.key === mode)?.desc} · 비중은 “이번 달 새로 넣는 돈”을 이렇게 나누라는 의미예요(전량 매도 아님).</p>

      {/* 계좌별 종목 */}
      <div className="grid gap-3 lg:grid-cols-2">
        {BASE_ACCOUNTS.map((acc) => {
          const Icon = ACCOUNT_ICON[acc.key] || PiggyBank
          const tilted = tiltAccount(acc, regime, mode)
          const monthly = Math.round(alloc?.[acc.key] || 0)
          const exp = blendedExpense(tilted)
          const ret = blendedReturn(tilted)
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
                {tilted.map((h) => (
                  <HoldingRow key={h.ticker + h.klass} h={h} monthly={monthly} />
                ))}
              </div>
            </Card>
          )
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        ※ 공격형·사회초년생 기준 <b>참고용 예시</b>이며 투자자문이 아닙니다. 보수율·세제 한도는 2026년 추정으로 변동될 수 있어 증권사/운용사 공시를 확인하세요. 종목명·티커는 동일 지수를 추종하는 타 운용사 ETF로 대체 가능합니다.
      </p>
    </div>
  )
}
