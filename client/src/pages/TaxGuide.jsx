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

const PENSION_START_AGE = 65
const MAX_YEARS = 50

const MONTHLY_CAP = {
  pension: 500_000,
  irp: 250_000,
  isa: 20_000_000 / 12,
  pensionExtra: 750_000,
}

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
//  시작 자산 = seedGrow(주식, 성장) + flatBase(부동산·현금CMA, 현상유지)
//  매달: 성장자산 = 성장자산×(1+월수익률) + (월급+부업−소비) − 목돈지출
//  총자산 = 성장자산 + flatBase. 월급은 매년 상승(진급 시 점프), 부업은 일정.
//  목표 년도가 있으면 그때까지 목표를 채우는 데 "매달 추가로 필요한 금액"을 역산.
function simulate({ startSalary, side, spend, raise, promotions, lumps, target, targetYear, annualReturn, startYear, startMonth, startAge, seedGrow, flatBase }) {
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

  let wealth = seedGrow // 성장 자산(주식 + 매월 저축 적립분)
  let principal = seedGrow + flatBase // 누적 원금(현재 보유 + 적립, 운용수익 제외)
  let reachMonth = null
  let dipsAfterReach = false
  const start = Math.round(seedGrow + flatBase)
  const yearly = [{ year: 0, total: start, principal: start }]

  for (let m = 0; m < MAX_M; m++) {
    const net = salaryByYear[Math.floor(m / 12)] + side - spend
    wealth = wealth * (1 + mRate) + net
    principal += net
    const lump = lumpByMonth[m]
    if (lump) {
      wealth -= lump
      principal -= lump
    }
    const total = wealth + flatBase
    if (target > 0) {
      if (reachMonth == null && total >= target) reachMonth = m + 1
      else if (reachMonth != null && total < target) dipsAfterReach = true
    }
    if ((m + 1) % 12 === 0) {
      yearly.push({ year: (m + 1) / 12, total: Math.round(total), principal: Math.round(principal) })
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

  let gap = null
  const targetYearOff = target > 0 && targetYear > startYear ? targetYear - startYear : 0
  if (targetYearOff >= 1 && targetYearOff <= MAX_YEARS) {
    const wealthAtTarget = yearly[targetYearOff]?.total ?? 0
    const N = targetYearOff * 12
    const annuity = mRate > 0 ? (Math.pow(1 + mRate, N) - 1) / mRate : N
    const shortfall = target - wealthAtTarget
    gap = {
      targetYear,
      years: targetYearOff,
      wealthAtTarget,
      shortfall,
      onTrack: shortfall <= 0,
      extraMonthly: shortfall > 0 && annuity > 0 ? shortfall / annuity : 0,
    }
  }

  const lastLumpYear = lumpYearsSet.size ? Math.max(...lumpYearsSet) : 0
  const retireYears = startAge > 0 ? Math.max(0, PENSION_START_AGE - startAge) : 0
  const baseYears = reach ? Math.max(reach.axisYear + 3, lastLumpYear + 2, 10) : Math.max(30, lastLumpYear + 5)
  const displayYears = Math.min(MAX_YEARS, Math.max(baseYears, retireYears, targetYearOff + 1))
  const rows = yearly.filter((r) => r.year <= displayYears)

  return {
    rows,
    start,
    displayYears,
    salaryByYear,
    monthlySavingNow: salaryByYear[0] + side - spend,
    salaryAtEnd: salaryByYear[displayYears],
    finalWealth: rows[rows.length - 1]?.total ?? 0,
    reach,
    dipsAfterReach,
    gap,
    lumpYears: [...lumpYearsSet].filter((y) => y <= displayYears),
  }
}

// ── 연도 ◀▶ 스테퍼 ──────────────────────────────────────────────
function StepBtn({ onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title} className="grid h-9 w-8 place-items-center text-slate-300 transition hover:bg-white/10 hover:text-white">
      {children}
    </button>
  )
}

function YearStepper({ value, onChange, defaultYear, min = 2000, max = 2100 }) {
  const y = Number(value) || defaultYear || new Date().getFullYear()
  const set = (n) => onChange(String(Math.min(max, Math.max(min, n))))
  return (
    <div className="inline-flex w-full items-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <StepBtn onClick={() => set(y - 1)} title="이전 해">
        <ChevronLeft size={16} />
      </StepBtn>
      <span className="tnum flex-1 select-none text-center text-sm text-slate-100">{y}년</span>
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

function Section({ title, children }) {
  return (
    <details className="mt-2 rounded-xl border border-white/10 bg-white/[0.02]">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-300 marker:text-slate-500">{title}</summary>
      <div className="border-t border-white/10 px-3 py-3">{children}</div>
    </details>
  )
}

export default function TaxGuide() {
  const saved = { ...load(), ...fromUrl() }
  const cy = new Date().getFullYear()
  const [copied, setCopied] = useState(false)
  const [salaryMan, setSalaryMan] = useState(saved.salaryMan ?? '') // 월 실수령(세후, 만원)
  const [sideMan, setSideMan] = useState(saved.sideMan ?? '') // 부업 월 수입(만원)
  const [spendMan, setSpendMan] = useState(saved.spendMan ?? '') // 월 소비(만원)
  const [age, setAge] = useState(saved.age ?? '') // 만 나이
  // 현재 보유 자산
  const [reEok, setReEok] = useState(saved.reEok ?? '') // 부동산(억)
  const [stockMan, setStockMan] = useState(saved.stockMan ?? '') // 주식(만원)
  const [cashMan, setCashMan] = useState(saved.cashMan ?? '') // 현금/CMA(만원)
  const [targetEok, setTargetEok] = useState(saved.targetEok ?? (saved.targetMan ? String((Number(saved.targetMan) || 0) / 10000) : '')) // 목표(억)
  const [targetYear, setTargetYear] = useState(saved.targetYear ?? String(cy + 10))
  const [hasEmergency, setHasEmergency] = useState(saved.hasEmergency ?? 'no')
  const [raisePct, setRaisePct] = useState(saved.raisePct ?? '3')
  const [promotions, setPromotions] = useState(() => toArr(saved.promotions))
  const [lumps, setLumps] = useState(() => toArr(saved.lumps))
  const [grossMan, setGrossMan] = useState(saved.grossMan ?? '')
  const [returnPct, setReturnPct] = useState(saved.returnPct ?? '5')
  const [prioritySel, setPrioritySel] = useState(saved.prioritySel ?? 'retire')

  useEffect(() => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ salaryMan, sideMan, spendMan, age, reEok, stockMan, cashMan, targetEok, targetYear, hasEmergency, raisePct, promotions, lumps, grossMan, returnPct, prioritySel }),
    )
  }, [salaryMan, sideMan, spendMan, age, reEok, stockMan, cashMan, targetEok, targetYear, hasEmergency, raisePct, promotions, lumps, grossMan, returnPct, prioritySel])

  const nextYear = cy + 1
  const thisYm = `${cy}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const addPromo = () => setPromotions((ps) => [...ps, { id: uid(), year: String(nextYear), salaryMan: '' }])
  const updPromo = (id, k, v) => setPromotions((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: v } : p)))
  const delPromo = (id) => setPromotions((ps) => ps.filter((p) => p.id !== id))
  const addLump = () => setLumps((ls) => [...ls, { id: uid(), ym: thisYm, amountMan: '', memo: '' }])
  const updLump = (id, k, v) => setLumps((ls) => ls.map((l) => (l.id === id ? { ...l, [k]: v } : l)))
  const delLump = (id) => setLumps((ls) => ls.filter((l) => l.id !== id))

  const salary = (Number(salaryMan) || 0) * 10000
  const side = (Number(sideMan) || 0) * 10000
  const spend = (Number(spendMan) || 0) * 10000
  const saving = Math.max(0, salary + side - spend)
  const realEstate = (parseFloat(reEok) || 0) * 100_000_000 // 부동산(원) — 현상유지
  const stocks = (Number(stockMan) || 0) * 10000 // 주식(원) — 성장
  const cash = (Number(cashMan) || 0) * 10000 // 현금/CMA(원) — 현상유지
  const seedGrow = stocks
  const flatBase = realEstate + cash
  const currentNetWorth = realEstate + stocks + cash
  const grossYear = (Number(grossMan) || 0) * 10000
  const target = (parseFloat(targetEok) || 0) * 100_000_000
  const tYear = Number(targetYear) || 0
  const ageNum = Number(age) || 0
  const ret = (Number(returnPct) || 0) / 100
  const raise = (Number(raisePct) || 0) / 100
  const annualNet = salary * 12

  const rate = grossYear > 0 ? (grossYear > 55_000_000 ? 0.132 : 0.165) : annualNet > 46_000_000 ? 0.132 : 0.165
  const rateBasis = grossYear > 0 ? '세전 연봉 기준' : '실수령 기준 추정'
  const emergencyTarget = (spend > 0 ? spend : salary) * 3
  const cmaCovered = cash > 0 ? cash >= emergencyTarget : hasEmergency === 'yes'

  const priority = prioritySel === 'midterm' ? 'midterm' : 'retire'
  const alloc = useMemo(() => allocate(saving, priority), [saving, priority])
  const deductibleYear = (alloc.pension + alloc.irp) * 12
  const refundYear = Math.round(deductibleYear * rate)

  const now = new Date()
  const startYear = now.getFullYear()
  const startMonth = now.getMonth() + 1
  const proj = useMemo(
    () =>
      simulate({
        startSalary: salary,
        side,
        spend,
        raise,
        promotions: promotions.map((p) => ({ year: Number(p.year) || 0, salary: (Number(p.salaryMan) || 0) * 10000 })).filter((p) => p.year > 0 && p.salary > 0),
        lumps: lumps
          .map((l) => {
            const [y, m] = String(l.ym || '').split('-').map((x) => Number(x))
            return { year: y || 0, month: m || 0, amount: (Number(l.amountMan) || 0) * 10000 }
          })
          .filter((l) => l.year > 0 && l.month >= 1 && l.month <= 12 && l.amount > 0),
        target,
        targetYear: tYear,
        annualReturn: ret,
        startYear,
        startMonth,
        startAge: ageNum,
        seedGrow,
        flatBase,
      }),
    [salary, side, spend, raise, promotions, lumps, target, tYear, ret, startYear, startMonth, ageNum, seedGrow, flatBase],
  )

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
    { key: 'pensionExtra', name: '연금저축 추가납입', role: '세액공제 초과 · 과세이연', concept: '자산배분', monthly: alloc.pensionExtra, capM: MONTHLY_CAP.pensionExtra, Icon: PiggyBank },
    { key: 'cma', name: 'CMA', role: '남는 돈 · 대기자금', concept: '수시입출 파킹', monthly: alloc.cma, capM: null, Icon: Wallet },
  ]
  const pieData = buckets.filter((b) => b.monthly > 0).map((b) => ({ name: b.name, value: Math.round(b.monthly) }))
  const hasInput = salary > 0 || currentNetWorth > 0

  const shareLink = async () => {
    const params = {
      salaryMan,
      sideMan,
      spendMan,
      age,
      reEok,
      stockMan,
      cashMan,
      targetEok,
      targetYear,
      hasEmergency,
      raisePct,
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
    <div className="space-y-4">
      {/* 입력 */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Calculator size={17} className="text-indigo-300" />
          <h2 className="text-sm font-semibold">자산 성장 · 절세 가이드</h2>
        </div>

        {/* 핵심 입력 */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Field label="월 실수령 (만원)">
            <Input type="number" inputMode="numeric" value={salaryMan} onChange={(e) => setSalaryMan(e.target.value)} placeholder="300" />
          </Field>
          <Field label="부업 수입 (만원)">
            <Input type="number" inputMode="numeric" value={sideMan} onChange={(e) => setSideMan(e.target.value)} placeholder="0" />
          </Field>
          <Field label="월 소비 (만원)">
            <Input type="number" inputMode="numeric" value={spendMan} onChange={(e) => setSpendMan(e.target.value)} placeholder="180" />
          </Field>
          <Field label="만 나이">
            <Input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="35" />
          </Field>
        </div>

        {/* 소비 슬라이더 + 자동 저축액 */}
        <div className="mt-2.5">
          <input type="range" min="0" max="500" step="5" value={Number(spendMan) || 0} onChange={(e) => setSpendMan(e.target.value)} className="w-full accent-indigo-400" />
          <div className="mt-1 text-[11px] text-slate-500">
            월 저축 가능액 = <b className={saving > 0 ? 'text-emerald-400' : 'text-rose-400'}>{fmtNum(Math.round(saving / 10000))}만원</b>
            <span className="text-slate-600"> (월급{side > 0 ? '+부업' : ''} − 소비)</span>
          </div>
        </div>

        {/* 현재 보유 자산 (시드) */}
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-medium text-slate-400">
            현재 보유 자산 (시작 시드)
            {currentNetWorth > 0 && <span className="text-slate-500"> · 총 {eok(currentNetWorth)}</span>}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Field label="부동산 (억)">
              <Input type="number" inputMode="decimal" step="0.1" value={reEok} onChange={(e) => setReEok(e.target.value)} placeholder="0" />
            </Field>
            <Field label="주식 (만원)">
              <Input type="number" inputMode="numeric" value={stockMan} onChange={(e) => setStockMan(e.target.value)} placeholder="0" />
            </Field>
            <Field label="현금/CMA (만원)">
              <Input type="number" inputMode="numeric" value={cashMan} onChange={(e) => setCashMan(e.target.value)} placeholder="0" />
            </Field>
          </div>
        </div>

        {/* 목표 */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Field label="목표 금액 (억원)" hint={target > 0 ? `= ${eok(target)}원` : '예: 5 = 5억'}>
            <Input type="number" inputMode="decimal" step="0.1" value={targetEok} onChange={(e) => setTargetEok(e.target.value)} placeholder="5" />
          </Field>
          <Field label="목표 년도" hint={tYear > startYear ? `${tYear - startYear}년 안에` : '언제까지'}>
            <YearStepper value={targetYear} onChange={setTargetYear} defaultYear={cy + 10} />
          </Field>
        </div>

        {/* 접이식 설정들 */}
        <Section title={`⚙️ 가정 설정 — 월급 상승 ${raisePct}% · 수익률 ${returnPct}%`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={`연 월급 상승률 ${raisePct}%`}>
              <input type="range" min="0" max="10" step="0.5" value={raisePct} onChange={(e) => setRaisePct(e.target.value)} className="mt-2 w-full accent-indigo-400" />
            </Field>
            <Field label={`예상 연 수익률 ${returnPct}%`} hint="주식·저축에 적용">
              <input type="range" min="0" max="12" step="0.5" value={returnPct} onChange={(e) => setReturnPct(e.target.value)} className="mt-2 w-full accent-indigo-400" />
            </Field>
            <Field label="세전 연봉 (만원)" hint="정확한 공제율">
              <Input type="number" inputMode="numeric" value={grossMan} onChange={(e) => setGrossMan(e.target.value)} placeholder="선택" />
            </Field>
            <Field label="비상금(CMA)" hint="현금 입력 시 자동 판정">
              <Select value={hasEmergency} onChange={(e) => setHasEmergency(e.target.value)}>
                <option value="no">아직 없음</option>
                <option value="yes">이미 있음</option>
              </Select>
            </Field>
            <Field label="배분 우선순위">
              <Select value={priority} onChange={(e) => setPrioritySel(e.target.value)}>
                <option value="retire">노후 우선 (연금 먼저)</option>
                <option value="midterm">중기목돈 우선 (ISA 먼저)</option>
              </Select>
            </Field>
          </div>
        </Section>

        <Section title={`📈 진급 계획${promotions.length ? ` (${promotions.length})` : ''}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">진급 연도와 그때의 월 실수령액</span>
            <button onClick={addPromo} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/15">
              <Plus size={13} /> 추가
            </button>
          </div>
          {promotions.length === 0 ? (
            <p className="text-[11px] text-slate-500">예) 2030년 월 실수령 360만 → 그 해부터 점프 후 다시 매년 상승</p>
          ) : (
            <div className="space-y-2">
              {promotions.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2">
                  <div className="w-32">
                    <YearStepper value={p.year} onChange={(v) => updPromo(p.id, 'year', v)} defaultYear={nextYear} />
                  </div>
                  <Input className="w-40 flex-1" type="number" inputMode="numeric" value={p.salaryMan} onChange={(e) => updPromo(p.id, 'salaryMan', e.target.value)} placeholder="진급 후 월 실수령(만원)" />
                  <button onClick={() => delPromo(p.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300" title="삭제">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`💸 목돈 지출 계획${lumps.length ? ` (${lumps.length})` : ''}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">언제 · 얼마를 쓸 예정인지</span>
            <button onClick={addLump} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/15">
              <Plus size={13} /> 추가
            </button>
          </div>
          {lumps.length === 0 ? (
            <p className="text-[11px] text-slate-500">예) 2031년 5월 결혼 5,000만 / 2034년 3월 전세 1억 — 그 시점에 차감</p>
          ) : (
            <div className="space-y-2">
              {lumps.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-2">
                  <MonthStepper value={l.ym} onChange={(v) => updLump(l.id, 'ym', v)} />
                  <Input className="w-24" type="number" inputMode="numeric" value={l.amountMan} onChange={(e) => updLump(l.id, 'amountMan', e.target.value)} placeholder="만원" />
                  <Input className="w-28 flex-1" value={l.memo} onChange={(e) => updLump(l.id, 'memo', e.target.value)} placeholder="메모" />
                  <button onClick={() => delLump(l.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300" title="삭제">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </Card>

      {!hasInput ? (
        <Card className="p-4">
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-slate-500">
            <Calculator size={26} className="text-slate-600" />
            <div>월 실수령·소비·나이·목표(+현재 자산)를 넣으면 자산 그래프와 목표 달성 분석이 나와요.</div>
          </div>
        </Card>
      ) : (
        <>
          {/* 자산 성장 프로젝션 */}
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <LineChart size={17} className="text-emerald-300" />
              <h3 className="text-sm font-semibold">자산 성장 프로젝션</h3>
              {currentNetWorth > 0 && <Pill tone="slate">현재 {eok(currentNetWorth)}</Pill>}
              {useAge && <Pill tone="blue">만 {ageNum}→{PENSION_START_AGE}세</Pill>}
              {side > 0 && <Pill tone="green">부업 +{fmtNum(Number(sideMan) || 0)}만</Pill>}
              {promotions.length > 0 && <Pill tone="indigo">진급 {promotions.length}회</Pill>}
              {lumps.length > 0 && <Pill tone="red">목돈 {lumps.length}건</Pill>}
              <button onClick={shareLink} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/15">
                <Share2 size={13} /> {copied ? '복사됨!' : '공유'}
              </button>
            </div>

            {/* 핵심 지표 3 */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/[0.03] p-3">
                <div className="text-[11px] text-slate-400">월 저축액</div>
                <div className={`tnum text-xl font-bold ${saving > 0 ? '' : 'text-rose-400'}`}>{fmtNum(Math.round(saving / 10000))}만</div>
                <div className="text-[11px] text-slate-500">월급 {fmtNum(Number(salaryMan) || 0)}만 → {endLabel} {fmtNum(Math.round(proj.salaryAtEnd / 10000))}만</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3">
                <div className="text-[11px] text-slate-400">{endLabel} 예상 자산</div>
                <div className="tnum text-xl font-bold">{eok(proj.finalWealth)}</div>
                <div className="text-[11px] text-slate-500">{currentNetWorth > 0 ? `현재 ${eok(currentNetWorth)} → ` : ''}{fmtNum(proj.finalWealth)}원</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3">
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <CalendarClock size={12} /> 지금 페이스 달성
                </div>
                {target <= 0 ? (
                  <div className="mt-1 text-xs text-slate-500">목표 금액 입력 시</div>
                ) : proj.reach ? (
                  <>
                    <div className="tnum text-xl font-bold text-emerald-400">{proj.reach.year}.{proj.reach.month}</div>
                    <div className="text-[11px] text-slate-500">
                      {useAge ? `만 ${ageNum + proj.reach.years}세 · ` : ''}{proj.reach.years > 0 ? `${proj.reach.years}년 ` : ''}{proj.reach.mos}개월 후
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-xs text-amber-300">{MAX_YEARS}년 내 미달성</div>
                )}
              </div>
            </div>

            {/* 목표년도 역산 (핵심) */}
            {target > 0 && proj.gap && (
              <div className={`mt-3 rounded-xl p-3 ring-1 ${proj.gap.onTrack ? 'bg-emerald-500/10 ring-emerald-500/25' : 'bg-amber-500/10 ring-amber-500/30'}`}>
                {proj.gap.onTrack ? (
                  <div className="flex items-center gap-2">
                    <Target size={16} className="text-emerald-300" />
                    <div className="text-sm">
                      <b className="text-emerald-300">🎉 {proj.gap.targetYear}년까지 목표 {eok(target)} 달성 예정</b>
                      <span className="text-slate-400"> · 예상 {eok(proj.gap.wealthAtTarget)} · 추가 저축/부업 불필요</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Target size={16} className="shrink-0 translate-y-0.5 text-amber-300" />
                    <span className="text-sm text-slate-300">{proj.gap.targetYear}년까지 {eok(target)} 모으려면</span>
                    <span className="tnum text-2xl font-bold text-amber-300">매달 +{fmtNum(Math.round(proj.gap.extraMonthly))}원</span>
                    <span className="w-full pl-6 text-[11px] text-slate-400">
                      더 <b>저축</b>하거나 <b>부업</b>으로 더 벌어야 해요 · {proj.gap.targetYear}년 예상 {eok(proj.gap.wealthAtTarget)} (부족 {eok(proj.gap.shortfall)})
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3">
              <GrowthChart data={chartRows} xUnit={xUnit} target={target} reachX={reachX} lumpXs={lumpXs} />
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: '#34d399' }} /> 총 자산</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: '#818cf8' }} /> 누적 원금</span>
                {target > 0 && <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-full" style={{ background: '#f59e0b' }} /> 목표선</span>}
                {lumps.length > 0 && <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-full" style={{ background: '#f43f5e' }} /> 목돈</span>}
                <span className="text-slate-500">· 가로축 {useAge ? '나이' : '경과연수'}</span>
              </div>
            </div>

            {proj.dipsAfterReach && <div className="mt-2 text-[11px] text-amber-300">※ 목표 달성 후 목돈 지출로 일시적으로 목표 아래로 내려갈 수 있어요.</div>}
            <p className="mt-2 text-[11px] text-slate-500">
              ※ 시작 시드 = 부동산+주식+현금. <b>부동산·현금(CMA)은 현상유지</b>, <b>주식·매월 저축만 {returnPct}% 복리</b>로 성장 가정. 소비·부업 일정, 월급만 매년 {raisePct}%(진급 시 점프) 상승.
            </p>
          </Card>

          {/* 절세계좌 — 접이식 (기본 닫힘) */}
          <details className="rounded-2xl border border-white/10 bg-white/[0.03]">
            <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-semibold marker:text-slate-500">
              <PiggyBank size={16} className="text-indigo-300" />
              절세계좌 추천 배분 · 환급
              <Pill tone="green" className="ml-1">연 {fmtNum(refundYear)}원 환급</Pill>
              <span className="ml-auto text-[11px] font-normal text-slate-500">펼치기</span>
            </summary>
            <div className="space-y-4 border-t border-white/10 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-400">예상 연 세액공제 환급액</div>
                  <div className="tnum mt-1 text-2xl font-bold text-emerald-400">{fmtNum(refundYear)}원</div>
                  <div className="mt-1 text-[11px] text-slate-500">공제율 {(rate * 100).toFixed(1)}% ({rateBasis}) · 공제대상 {fmtNum(Math.round(deductibleYear / 10000))}만/년</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">권장 비상금 (CMA)</div>
                  <div className="tnum mt-1 text-xl font-bold">{fmtNum(emergencyTarget)}원</div>
                  <div className="mt-1 flex items-center gap-2">
                    {cmaCovered ? <Pill tone="green">확보됨</Pill> : <Pill tone="amber">부족</Pill>}
                    <span className="text-[11px] text-slate-500">{cash > 0 ? `현금(CMA) ${eok(cash)} 보유` : '월 소비 3개월'}</span>
                  </div>
                </div>
              </div>
              {!cmaCovered && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  <Info size={13} className="mt-0.5 shrink-0" />
                  <span>먼저 비상금 {fmtNum(emergencyTarget)}원을 CMA에 채운 뒤 아래 배분을 시작하세요{cash > 0 ? ` (현재 현금 ${eok(cash)})` : ''}.</span>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-3">
                  <div className="mb-1 text-xs font-medium text-slate-300">월 저축 {fmtNum(saving)}원 배분</div>
                  {pieData.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-center text-xs text-slate-500">저축 여력이 없어요. 소비를 줄여보세요.</div>
                  ) : (
                    <>
                      <AllocationPie data={pieData} />
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {pieData.map((d, i) => (
                          <span key={d.name} className="flex items-center gap-1 text-[11px] text-slate-400">
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
                      <Card key={b.key} className={`p-3 ${b.monthly > 0 ? '' : 'opacity-50'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <b.Icon size={16} className="shrink-0 text-slate-300" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold">{b.name}</span>
                                {full && <Pill tone="green">한도</Pill>}
                              </div>
                              <div className="truncate text-[11px] text-slate-400">{b.role}</div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="tnum text-sm font-semibold">{fmtNum(Math.round(b.monthly))}원<span className="text-[11px] font-normal text-slate-500">/월</span></div>
                          </div>
                        </div>
                        {b.capM != null && (
                          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                            <div className="h-full rounded-full bg-indigo-400/70" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </div>

              <AccountGuide />
              <p className="text-[11px] leading-relaxed text-slate-500">
                ※ 박곰희 작가의 절세계좌 전략과 2026년 세제 한도를 참고한 <b>참고용 가이드</b>입니다. 추정값이며 투자 자문이 아닙니다. 세부 한도·요건은 증권사/국세청 기준을 확인하세요.
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
