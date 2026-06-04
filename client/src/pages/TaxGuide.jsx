import { useEffect, useMemo, useState } from 'react'
import { Calculator, CalendarClock, ChevronLeft, ChevronRight, Info, Landmark, LineChart, Plus, PiggyBank, Share2, Target, TrendingUp, Trash2, Wallet } from 'lucide-react'
import { Card, Field, Input, Pill, Select } from '../components/ui.jsx'
import { fmtNum } from '../lib/format.js'
import AllocationPie, { COLORS } from '../components/AllocationPie.jsx'
import GrowthChart from '../components/GrowthChart.jsx'
import AccountGuide from '../components/AccountGuide.jsx'

const LS_KEY = 'taxguide.inputs.v4'
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {}
  } catch {
    return {}
  }
}

// 공유 링크(#/?key=val...)로 들어오면 그 값으로 시작
const fromUrl = () => {
  try {
    const h = window.location.hash
    const qi = h.indexOf('?')
    if (qi < 0) return {}
    return Object.fromEntries(new URLSearchParams(h.slice(qi + 1)).entries())
  } catch {
    return {}
  }
}

// 배열 입력값(진급/목돈)을 정규화 — localStorage(배열) / URL(JSON 문자열) 모두 처리
const uid = () => globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)
const toArr = (v) => {
  let a = v
  if (typeof v === 'string') {
    try {
      a = JSON.parse(v)
    } catch {
      a = []
    }
  }
  return Array.isArray(a) ? a.map((x) => ({ id: x.id ?? uid(), ...x })) : []
}

const PENSION_START_AGE = 65 // 연금 개시(그래프 기본 종료 시점)
const MAX_YEARS = 50 // 시뮬레이션 최대 기간

// 월 납입 한도(원) — 2026 기준
const MONTHLY_CAP = {
  pension: 500_000, // 연금저축 세액공제 한도 연 600만
  irp: 250_000, // IRP 추가 세액공제 연 300만 (연금저축 합산 900만)
  isa: 20_000_000 / 12, // ISA 납입한도 연 2,000만
  pensionExtra: 750_000, // 연금계좌 총 1,800만 − 세액공제 900만 = 추가 900만(안세공)
}

// 우선순위(노후 우선 / 중기목돈 우선)에 따라 월 저축액을 폭포수 배분
function allocate(saving, priority) {
  let rest = Math.max(0, saving || 0)
  const take = (cap) => {
    const a = Math.min(rest, cap)
    rest -= a
    return a
  }
  if (priority === 'midterm') {
    const isa = take(MONTHLY_CAP.isa)
    const pension = take(MONTHLY_CAP.pension)
    const irp = take(MONTHLY_CAP.irp)
    const pensionExtra = take(MONTHLY_CAP.pensionExtra)
    return { pension, irp, isa, pensionExtra, cma: rest }
  }
  const pension = take(MONTHLY_CAP.pension)
  const irp = take(MONTHLY_CAP.irp)
  const isa = take(MONTHLY_CAP.isa)
  const pensionExtra = take(MONTHLY_CAP.pensionExtra)
  return { pension, irp, isa, pensionExtra, cma: rest }
}

// ── 자산 성장 시뮬레이션 (월 단위) ──────────────────────────────
//  매달:  자산 = 자산×(1+월수익률) + (월급 − 소비) − (그 달 목돈지출)
//  월급은 매년 (1+상승률), 진급 연도엔 지정 월급으로 점프 후 다시 상승.
//  그래프는 연금 개시(65세)까지 그린다(나이 입력 시).
function simulate({ startSalary, spend, raise, promotions, lumps, target, annualReturn, startYear, startMonth, startAge }) {
  const MAX_M = MAX_YEARS * 12
  const mRate = annualReturn / 12

  const promoByOff = {}
  for (const p of promotions) {
    const off = p.year - startYear
    if (off >= 0 && off <= MAX_YEARS) promoByOff[off] = p.salary
  }
  const salaryByYear = []
  for (let y = 0; y <= MAX_YEARS; y++) {
    let s = y === 0 ? startSalary : salaryByYear[y - 1] * (1 + raise)
    if (promoByOff[y] != null) s = promoByOff[y]
    salaryByYear[y] = s
  }

  const lumpByMonth = {}
  const lumpYearsSet = new Set()
  for (const l of lumps) {
    const off = (l.year - startYear) * 12 + (l.month - startMonth)
    if (off >= 0 && off < MAX_M) {
      lumpByMonth[off] = (lumpByMonth[off] || 0) + l.amount
      lumpYearsSet.add(Math.max(0, Math.round((off + 1) / 12)))
    }
  }

  let wealth = 0
  let principal = 0 // 누적 저축원금(목돈지출 차감, 운용수익 제외)
  let reachMonth = null
  let dipsAfterReach = false
  const yearly = [{ year: 0, total: 0, principal: 0 }]

  for (let m = 0; m < MAX_M; m++) {
    const net = salaryByYear[Math.floor(m / 12)] - spend
    wealth = wealth * (1 + mRate) + net
    principal += net
    const lump = lumpByMonth[m]
    if (lump) {
      wealth -= lump
      principal -= lump
    }
    if (target > 0) {
      if (reachMonth == null && wealth >= target) reachMonth = m + 1
      else if (reachMonth != null && wealth < target) dipsAfterReach = true
    }
    if ((m + 1) % 12 === 0) {
      yearly.push({ year: (m + 1) / 12, total: Math.round(wealth), principal: Math.round(principal) })
    }
  }

  let reach = null
  if (reachMonth != null) {
    const dt = new Date(startYear, startMonth - 1 + reachMonth, 1)
    reach = {
      months: reachMonth,
      years: Math.floor(reachMonth / 12),
      mos: reachMonth % 12,
      year: dt.getFullYear(),
      month: dt.getMonth() + 1,
      axisYear: Math.max(0, Math.round(reachMonth / 12)),
    }
  }

  const lastLumpYear = lumpYearsSet.size ? Math.max(...lumpYearsSet) : 0
  // 연금 개시(65세)까지 — 나이가 있으면 거기까지, 없으면 기본 30년. 목표 달성·목돈 시점도 포함.
  const retireYears = startAge > 0 ? Math.max(0, PENSION_START_AGE - startAge) : 0
  const baseYears = reach ? Math.max(reach.axisYear + 3, lastLumpYear + 2, 10) : Math.max(30, lastLumpYear + 5)
  const displayYears = Math.min(MAX_YEARS, Math.max(baseYears, retireYears))
  const rows = yearly.filter((r) => r.year <= displayYears)

  return {
    rows,
    displayYears,
    salaryByYear,
    monthlySavingNow: salaryByYear[0] - spend,
    salaryAtEnd: salaryByYear[displayYears],
    finalWealth: rows[rows.length - 1]?.total ?? 0,
    reach,
    dipsAfterReach,
    lumpYears: [...lumpYearsSet].filter((y) => y <= displayYears),
  }
}

// ── 연도 ◀▶ 스테퍼 ──────────────────────────────────────────────
function StepBtn({ onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="grid h-9 w-9 place-items-center text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  )
}

function YearStepper({ value, onChange, min = 2000, max = 2100 }) {
  const cur = new Date().getFullYear()
  const y = Number(value) || cur
  const set = (n) => onChange(String(Math.min(max, Math.max(min, n))))
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <StepBtn onClick={() => set(y - 1)} title="이전 해">
        <ChevronLeft size={16} />
      </StepBtn>
      <span className="tnum w-16 select-none text-center text-sm text-slate-100">{y}년</span>
      <StepBtn onClick={() => set(y + 1)} title="다음 해">
        <ChevronRight size={16} />
      </StepBtn>
    </div>
  )
}

function MonthStepper({ value, onChange }) {
  const now = new Date()
  let [y, m] = String(value || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number)
  if (!y) y = now.getFullYear()
  if (!m) m = now.getMonth() + 1
  const set = (yy, mm) => onChange(`${yy}-${String(mm).padStart(2, '0')}`)
  const stepM = (d) => {
    let mm = m + d
    let yy = y
    if (mm < 1) {
      mm = 12
      yy--
    }
    if (mm > 12) {
      mm = 1
      yy++
    }
    set(yy, mm)
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="inline-flex items-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <StepBtn onClick={() => set(y - 1, m)} title="이전 해">
          <ChevronLeft size={16} />
        </StepBtn>
        <span className="tnum w-14 select-none text-center text-sm text-slate-100">{y}년</span>
        <StepBtn onClick={() => set(y + 1, m)} title="다음 해">
          <ChevronRight size={16} />
        </StepBtn>
      </div>
      <div className="inline-flex items-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <StepBtn onClick={() => stepM(-1)} title="이전 달">
          <ChevronLeft size={16} />
        </StepBtn>
        <span className="tnum w-9 select-none text-center text-sm text-slate-100">{m}월</span>
        <StepBtn onClick={() => stepM(1)} title="다음 달">
          <ChevronRight size={16} />
        </StepBtn>
      </div>
    </div>
  )
}

export default function TaxGuide() {
  const saved = { ...load(), ...fromUrl() }
  const [copied, setCopied] = useState(false)
  const [salaryMan, setSalaryMan] = useState(saved.salaryMan ?? '') // 월 실수령액(세후, 만원)
  const [spendMan, setSpendMan] = useState(saved.spendMan ?? '') // 월 소비액(만원)
  const [age, setAge] = useState(saved.age ?? '') // 만 나이
  const [hasEmergency, setHasEmergency] = useState(saved.hasEmergency ?? 'no')
  const [raisePct, setRaisePct] = useState(saved.raisePct ?? '3') // 연 월급 상승률(%)
  const [promotions, setPromotions] = useState(() => toArr(saved.promotions)) // [{id, year, salaryMan}]
  const [lumps, setLumps] = useState(() => toArr(saved.lumps)) // [{id, ym, amountMan, memo}]
  // 목표 금액: 억원 단위 (이전 버전 targetMan(만원) → 억으로 자동 변환)
  const [targetEok, setTargetEok] = useState(saved.targetEok ?? (saved.targetMan ? String((Number(saved.targetMan) || 0) / 10000) : ''))
  const [grossMan, setGrossMan] = useState(saved.grossMan ?? '') // 세전 연봉(만원, 선택)
  const [returnPct, setReturnPct] = useState(saved.returnPct ?? '5') // 예상 연 수익률(%)
  const [prioritySel, setPrioritySel] = useState(saved.prioritySel ?? 'retire') // retire | midterm

  useEffect(() => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ salaryMan, spendMan, age, hasEmergency, raisePct, promotions, lumps, targetEok, grossMan, returnPct, prioritySel }),
    )
  }, [salaryMan, spendMan, age, hasEmergency, raisePct, promotions, lumps, targetEok, grossMan, returnPct, prioritySel])

  // 진급 / 목돈 목록 편집
  const nextYear = new Date().getFullYear() + 1
  const thisYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const addPromo = () => setPromotions((ps) => [...ps, { id: uid(), year: String(nextYear), salaryMan: '' }])
  const updPromo = (id, k, v) => setPromotions((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: v } : p)))
  const delPromo = (id) => setPromotions((ps) => ps.filter((p) => p.id !== id))
  const addLump = () => setLumps((ls) => [...ls, { id: uid(), ym: thisYm, amountMan: '', memo: '' }])
  const updLump = (id, k, v) => setLumps((ls) => ls.map((l) => (l.id === id ? { ...l, [k]: v } : l)))
  const delLump = (id) => setLumps((ls) => ls.filter((l) => l.id !== id))

  const salary = (Number(salaryMan) || 0) * 10000 // 월 실수령액(원)
  const spend = (Number(spendMan) || 0) * 10000 // 월 소비액(원)
  const saving = Math.max(0, salary - spend) // 월 저축액(첫해, 원)
  const grossYear = (Number(grossMan) || 0) * 10000 // 세전 연봉(원)
  const target = (parseFloat(targetEok) || 0) * 100_000_000 // 목표 금액(원)
  const ageNum = Number(age) || 0
  const ret = (Number(returnPct) || 0) / 100
  const raise = (Number(raisePct) || 0) / 100
  const annualNet = salary * 12

  // 세액공제율: 세전 연봉 있으면 정확, 없으면 실수령 기준 추정
  const rate = grossYear > 0 ? (grossYear > 55_000_000 ? 0.132 : 0.165) : annualNet > 46_000_000 ? 0.132 : 0.165
  const rateBasis = grossYear > 0 ? '세전 연봉 기준' : '실수령 기준 추정'

  // 비상금: 월 소비 있으면 소비×3, 없으면 실수령×3
  const emergencyTarget = (spend > 0 ? spend : salary) * 3
  const emgBasis = spend > 0 ? '월 소비 3개월' : '월 실수령 3개월'

  // 노후 우선(기본) / 중기목돈 우선(ISA 먼저) — 현재(첫해) 월 저축액 기준 배분
  const priority = prioritySel === 'midterm' ? 'midterm' : 'retire'
  const alloc = useMemo(() => allocate(saving, priority), [saving, priority])
  const deductibleYear = (alloc.pension + alloc.irp) * 12 // 세액공제 대상(연)
  const refundYear = Math.round(deductibleYear * rate) // 예상 환급(연)

  // 자산 성장 프로젝션
  const now = new Date()
  const startYear = now.getFullYear()
  const startMonth = now.getMonth() + 1
  const proj = useMemo(
    () =>
      simulate({
        startSalary: salary,
        spend,
        raise,
        promotions: promotions
          .map((p) => ({ year: Number(p.year) || 0, salary: (Number(p.salaryMan) || 0) * 10000 }))
          .filter((p) => p.year > 0 && p.salary > 0),
        lumps: lumps
          .map((l) => {
            const [y, m] = String(l.ym || '').split('-').map((x) => Number(x))
            return { year: y || 0, month: m || 0, amount: (Number(l.amountMan) || 0) * 10000 }
          })
          .filter((l) => l.year > 0 && l.month >= 1 && l.month <= 12 && l.amount > 0),
        target,
        annualReturn: ret,
        startYear,
        startMonth,
        startAge: ageNum,
      }),
    [salary, spend, raise, promotions, lumps, target, ret, startYear, startMonth, ageNum],
  )

  // 가로축: 나이가 있으면 "세", 없으면 "년 뒤"
  const useAge = ageNum > 0
  const xUnit = useAge ? '세' : '년'
  const toX = (yr) => (useAge ? ageNum + yr : yr)
  const chartRows = proj.rows.map((r) => ({ x: toX(r.year), total: r.total, principal: r.principal }))
  const reachX = proj.reach ? toX(proj.reach.axisYear) : null
  const lumpXs = proj.lumpYears.map(toX)
  const endLabel = useAge ? `만 ${ageNum + proj.displayYears}세` : `${proj.displayYears}년 후`

  const buckets = [
    { key: 'pension', name: '연금저축', role: '노후 핵심 · 세액공제', concept: '자산배분 ETF', monthly: alloc.pension, capM: MONTHLY_CAP.pension, Icon: PiggyBank },
    { key: 'irp', name: 'IRP', role: '세액공제 보강 (합산 연 900만)', concept: 'TDF', monthly: alloc.irp, capM: MONTHLY_CAP.irp, Icon: Landmark },
    { key: 'isa', name: 'ISA', role: '중기 목돈 · 비과세/분리과세', concept: '배당', monthly: alloc.isa, capM: MONTHLY_CAP.isa, Icon: TrendingUp },
    { key: 'pensionExtra', name: '연금저축 추가납입', role: '세액공제 초과(안세공) · 과세이연', concept: '자산배분', monthly: alloc.pensionExtra, capM: MONTHLY_CAP.pensionExtra, Icon: PiggyBank },
    { key: 'cma', name: 'CMA', role: '남는 돈 · 대기자금', concept: '수시입출 파킹', monthly: alloc.cma, capM: null, Icon: Wallet },
  ]
  const pieData = buckets.filter((b) => b.monthly > 0).map((b) => ({ name: b.name, value: Math.round(b.monthly) }))
  const hasInput = salary > 0

  const shareLink = async () => {
    const params = {
      salaryMan,
      spendMan,
      age,
      hasEmergency,
      raisePct,
      targetEok,
      grossMan,
      returnPct,
      prioritySel,
      promotions: promotions.length ? JSON.stringify(promotions) : '',
      lumps: lumps.length ? JSON.stringify(lumps) : '',
    }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) p.set(k, v)
    const url = `${window.location.origin}${window.location.pathname}#/?${p.toString()}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('이 링크를 복사하세요', url)
    }
  }

  const eok = (won) => {
    const e = Math.floor(won / 100_000_000)
    const m = Math.round((won % 100_000_000) / 10000)
    if (e > 0) return `${e}억${m > 0 ? ' ' + fmtNum(m) + '만' : ''}`
    return fmtNum(m) + '만'
  }

  return (
    <div className="space-y-5">
      {/* 입력 */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Calculator size={18} className="text-indigo-300" />
          <h2 className="text-base font-semibold">자산 성장 · 절세 가이드</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="월 실수령액 (세후, 만원)" hint="지금 매달 통장에 들어오는 금액">
            <Input type="number" inputMode="numeric" value={salaryMan} onChange={(e) => setSalaryMan(e.target.value)} placeholder="예: 300" />
          </Field>
          <Field label="월 소비액 (만원)" hint="매달 쓰는 돈 (저축은 자동 계산)">
            <Input type="number" inputMode="numeric" value={spendMan} onChange={(e) => setSpendMan(e.target.value)} placeholder="예: 180" />
          </Field>
          <Field label="만 나이" hint="그래프 X축(나이) · 연금개시(65세)까지 표시">
            <Input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="예: 35" />
          </Field>
        </div>

        {/* 소비 슬라이더 + 자동 저축액 */}
        <div className="mt-3">
          <input
            type="range"
            min="0"
            max="500"
            step="5"
            value={Number(spendMan) || 0}
            onChange={(e) => setSpendMan(e.target.value)}
            className="w-full accent-indigo-400"
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>
              월 소비 슬라이더: {fmtNum(Number(spendMan) || 0)}만원 →{' '}
              <b className={saving > 0 ? 'text-emerald-400' : 'text-rose-400'}>월 저축 {fmtNum(Math.round(saving / 10000))}만원</b>
            </span>
            <span>0 ~ 500만</span>
          </div>
        </div>

        {/* 목표(억) · 월급 상승률 */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="목표 금액 (억원)" hint={target > 0 ? `= ${eok(target)}원 모으기` : '얼마를 모으고 싶나요? (억 단위)'}>
            <Input type="number" inputMode="decimal" step="0.1" value={targetEok} onChange={(e) => setTargetEok(e.target.value)} placeholder="예: 5" />
          </Field>
          <Field label={`연 월급 상승률 — ${raisePct}%`} hint="매년 오르는 비율 (보수적으로)">
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={raisePct}
              onChange={(e) => setRaisePct(e.target.value)}
              className="mt-2 w-full accent-indigo-400"
            />
          </Field>
        </div>

        {/* 진급 계획 */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium text-slate-400">진급 계획 (선택) — 진급 연도와 그때의 월 실수령액</div>
            <button onClick={addPromo} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/15">
              <Plus size={13} /> 진급 추가
            </button>
          </div>
          {promotions.length === 0 ? (
            <p className="text-[11px] text-slate-500">예) 2030년에 월 실수령 360만 → 그 해부터 360만으로 점프 후 다시 매년 상승</p>
          ) : (
            <div className="space-y-2">
              {promotions.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2">
                  <YearStepper value={p.year} onChange={(v) => updPromo(p.id, 'year', v)} />
                  <Input
                    className="w-44 flex-1"
                    type="number"
                    inputMode="numeric"
                    value={p.salaryMan}
                    onChange={(e) => updPromo(p.id, 'salaryMan', e.target.value)}
                    placeholder="진급 후 월 실수령(만원)"
                  />
                  <button onClick={() => delPromo(p.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300" title="삭제">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 목돈 지출 계획 */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium text-slate-400">목돈 지출 계획 (선택) — 언제 · 얼마를 쓸 예정인지</div>
            <button onClick={addLump} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/15">
              <Plus size={13} /> 목돈 추가
            </button>
          </div>
          {lumps.length === 0 ? (
            <p className="text-[11px] text-slate-500">예) 2031년 5월 결혼자금 5,000만 / 2034년 3월 전세보증금 1억 — 그래프에서 그 시점에 차감돼요</p>
          ) : (
            <div className="space-y-2">
              {lumps.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-2">
                  <MonthStepper value={l.ym} onChange={(v) => updLump(l.id, 'ym', v)} />
                  <Input
                    className="w-28"
                    type="number"
                    inputMode="numeric"
                    value={l.amountMan}
                    onChange={(e) => updLump(l.id, 'amountMan', e.target.value)}
                    placeholder="금액(만원)"
                  />
                  <Input className="w-32 flex-1" value={l.memo} onChange={(e) => updLump(l.id, 'memo', e.target.value)} placeholder="메모 (예: 결혼)" />
                  <button onClick={() => delLump(l.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300" title="삭제">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 정밀 설정 */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="mb-2 text-xs font-medium text-slate-400">정밀 · 시뮬레이션 설정 (선택)</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="비상금(CMA)" hint="3~6개월 생활비">
              <Select value={hasEmergency} onChange={(e) => setHasEmergency(e.target.value)}>
                <option value="no">아직 없음</option>
                <option value="yes">이미 있음</option>
              </Select>
            </Field>
            <Field label="세전 연봉 (만원)" hint="정확한 공제율">
              <Input type="number" inputMode="numeric" value={grossMan} onChange={(e) => setGrossMan(e.target.value)} placeholder="선택" />
            </Field>
            <Field label={`예상 연 수익률 — ${returnPct}%`} hint="0이면 순수 저축">
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={returnPct}
                onChange={(e) => setReturnPct(e.target.value)}
                className="mt-2 w-full accent-indigo-400"
              />
            </Field>
            <Field label="우선순위" hint="20·30대 중기목돈이면 ISA 먼저">
              <Select value={priority} onChange={(e) => setPrioritySel(e.target.value)}>
                <option value="retire">노후 우선 (연금 먼저)</option>
                <option value="midterm">중기목돈 우선 (ISA 먼저)</option>
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      {!hasInput ? (
        <Card className="p-4">
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-slate-500">
            <Calculator size={28} className="text-slate-600" />
            <div>
              월 실수령액 · 월 소비액 · 만 나이를 입력하면
              <br />
              월급 상승·진급·목돈 지출을 반영한 자산 그래프(연금개시까지)와 목표 달성 시점을 보여드려요.
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <button
              onClick={shareLink}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/15"
            >
              <Share2 size={14} /> {copied ? '링크 복사됨!' : '결과 링크 복사'}
            </button>
          </div>

          {/* 자산 성장 프로젝션 */}
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <LineChart size={18} className="text-emerald-300" />
              <h3 className="text-base font-semibold">자산 성장 프로젝션</h3>
              <Pill tone="slate">월급 상승 {raisePct}%/년 · 수익률 {returnPct}%</Pill>
              {useAge && <Pill tone="blue">만 {ageNum}세 → {PENSION_START_AGE}세</Pill>}
              {promotions.length > 0 && <Pill tone="indigo">진급 {promotions.length}회 반영</Pill>}
              {lumps.length > 0 && <Pill tone="red">목돈지출 {lumps.length}건 반영</Pill>}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-slate-400">현재 월 저축액 (월급 − 소비)</div>
                <div className={`tnum mt-1 text-2xl font-bold ${saving > 0 ? '' : 'text-rose-400'}`}>{fmtNum(Math.round(saving))}원</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  월급 {fmtNum(Number(salaryMan) || 0)}만 → {endLabel} {fmtNum(Math.round(proj.salaryAtEnd / 10000))}만
                </div>
              </div>
              <div className="sm:col-span-2 rounded-xl bg-emerald-500/5 p-3 ring-1 ring-emerald-500/20">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Target size={13} className="text-amber-300" /> 목표 금액 달성 시점
                </div>
                {target <= 0 ? (
                  <div className="mt-1 text-sm text-slate-400">위에 「목표 금액(억원)」을 입력하면 달성 시점을 계산해요.</div>
                ) : proj.reach ? (
                  <>
                    <div className="tnum mt-1 text-2xl font-bold text-emerald-400">
                      {proj.reach.year}년 {proj.reach.month}월
                      <span className="ml-2 text-sm font-medium text-slate-300">
                        ({useAge ? `만 ${ageNum + proj.reach.years}세 · ` : ''}지금부터 {proj.reach.years > 0 ? `${proj.reach.years}년 ` : ''}
                        {proj.reach.mos}개월 후)
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                      <CalendarClock size={12} /> 목표 {eok(target)}원 · 목돈 지출 시점까지 반영된 결과예요.
                    </div>
                    {proj.dipsAfterReach && (
                      <div className="mt-1 text-[11px] text-amber-300">※ 달성 후 목돈 지출로 일시적으로 목표 아래로 내려갈 수 있어요.</div>
                    )}
                  </>
                ) : (
                  <div className="mt-1 text-sm text-amber-300">
                    {useAge ? `만 ${ageNum + proj.displayYears}세` : `${proj.displayYears}년`}까지는 목표에 도달하지 못해요. 소비를 줄이거나 목표·수익률을 조정해 보세요.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <GrowthChart data={chartRows} xUnit={xUnit} target={target} reachX={reachX} lumpXs={lumpXs} />
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: '#34d399' }} /> 총 자산
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: '#818cf8' }} /> 누적 저축원금
                </span>
                {target > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-3 rounded-full" style={{ background: '#f59e0b' }} /> 목표선
                  </span>
                )}
                {lumps.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-3 rounded-full" style={{ background: '#f43f5e' }} /> 목돈 지출
                  </span>
                )}
                <span className="text-slate-500">· 가로축: {useAge ? '나이(세)' : '경과 연수'}</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="text-slate-400">
                {endLabel} 예상 자산 <b className="tnum text-slate-100">{fmtNum(proj.finalWealth)}원</b>
                <span className="text-slate-500"> ({eok(proj.finalWealth)})</span>
              </span>
            </div>

            {lumps.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {lumps
                  .filter((l) => l.ym && (Number(l.amountMan) || 0) > 0)
                  .map((l) => (
                    <Pill key={l.id} tone="red">
                      {l.ym.replace('-', '.')} {l.memo ? `${l.memo} ` : ''}−{fmtNum(Number(l.amountMan) || 0)}만
                    </Pill>
                  ))}
              </div>
            )}

            <p className="mt-2 text-[11px] text-slate-500">
              ※ 매달 (월급 − 소비)를 저축하고 {returnPct}% 복리로 굴린다는 단순 가정이에요. 소비는 일정하게 유지, 월급은 매년 {raisePct}%(진급 시 점프) 상승으로 계산합니다. 실제와 다를 수 있어요.
            </p>
          </Card>

          {/* 요약: 환급 + 비상금 */}
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm text-slate-400">예상 연 세액공제 환급액</div>
                <div className="tnum mt-1 text-3xl font-bold text-emerald-400">{fmtNum(refundYear)}원</div>
                <div className="mt-1 text-xs text-slate-500">
                  세액공제율 {(rate * 100).toFixed(1)}% ({rateBasis}) · 공제대상 {fmtNum(Math.round(deductibleYear / 10000))}만원/년
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-400">권장 비상금 (CMA)</div>
                <div className="tnum mt-1 text-2xl font-bold">{fmtNum(emergencyTarget)}원</div>
                <div className="mt-1 flex items-center gap-2">
                  {hasEmergency === 'no' ? <Pill tone="amber">아직 없음 — 먼저 채우기</Pill> : <Pill tone="green">확보됨 — 바로 투자</Pill>}
                  <span className="text-[11px] text-slate-500">{emgBasis}</span>
                </div>
              </div>
            </div>
            {hasEmergency === 'no' && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>
                  아래 배분은 <b>비상금을 다 모은 뒤</b> 기준이에요. 그 전에는 매달 저축을 먼저 CMA에 모아 {fmtNum(emergencyTarget)}원을 만든 다음 시작하세요.
                </span>
              </div>
            )}
          </Card>

          {/* 배분 시각화 + 계좌별 (현재 월 저축액 기준) */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 text-sm font-medium text-slate-300">현재 월 저축 {fmtNum(saving)}원 배분</div>
              {pieData.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-center text-sm text-slate-500">
                  소비가 월급보다 커서 저축 여력이 없어요. 월 소비액을 줄여보세요.
                </div>
              ) : (
                <>
                  <AllocationPie data={pieData} />
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {pieData.map((d, i) => (
                      <span key={d.name} className="flex items-center gap-1 text-xs text-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {d.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <div className="space-y-2">
              {buckets.map((b) => {
                const pct = b.capM ? Math.min(100, (b.monthly / b.capM) * 100) : 0
                const full = b.capM != null && b.monthly >= b.capM - 0.5
                return (
                  <Card key={b.key} className={`p-4 ${b.monthly > 0 ? '' : 'opacity-50'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <b.Icon size={18} className="shrink-0 text-slate-300" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{b.name}</span>
                            {full && <Pill tone="green">한도 채움</Pill>}
                          </div>
                          <div className="truncate text-xs text-slate-400">{b.role}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tnum font-semibold">
                          {fmtNum(Math.round(b.monthly))}원<span className="text-xs font-normal text-slate-500">/월</span>
                        </div>
                        <div className="tnum text-xs text-slate-500">연 {fmtNum(Math.round(b.monthly * 12))}원</div>
                      </div>
                    </div>
                    {b.capM != null && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-indigo-400/70" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div className="mt-1.5 text-[11px] text-slate-500">
                      운용 컨셉: {b.concept}
                      {b.capM != null && ` · 월 한도 ${fmtNum(Math.round(b.capM))}원`}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          <AccountGuide />

          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            ※ 박곰희 작가의 절세계좌 전략과 2026년 세제 한도를 참고한 <b>참고용 가이드</b>입니다. 세액공제율·미래 자산은 추정값이며, 투자 자문·권유가 아닙니다. 실제 납입·투자 판단과 손익은 본인 책임이며, 세부 한도·요건은 가입 증권사/국세청 기준을 확인하세요.
          </p>
        </>
      )}
    </div>
  )
}
