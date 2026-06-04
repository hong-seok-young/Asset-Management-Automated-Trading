import { useEffect, useMemo, useState } from 'react'
import { Calculator, Info, Landmark, LineChart, PiggyBank, Share2, TrendingUp, Wallet } from 'lucide-react'
import { Card, Field, Input, Pill, Select } from '../components/ui.jsx'
import { fmtNum } from '../lib/format.js'
import AllocationPie, { COLORS } from '../components/AllocationPie.jsx'
import GrowthChart from '../components/GrowthChart.jsx'
import AccountGuide from '../components/AccountGuide.jsx'

const LS_KEY = 'taxguide.inputs.v3'
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

const PENSION_START_AGE = 65 // 연금 개시(투자기간 기준)
const PAYOUT_YEARS = 25 // 연금 수령 가정 기간

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
    // 20~30대: 중도인출 가능한 ISA 먼저
    const isa = take(MONTHLY_CAP.isa)
    const pension = take(MONTHLY_CAP.pension)
    const irp = take(MONTHLY_CAP.irp)
    const pensionExtra = take(MONTHLY_CAP.pensionExtra)
    return { pension, irp, isa, pensionExtra, cma: rest }
  }
  // 노후 우선(기본): 세액공제부터 꽉
  const pension = take(MONTHLY_CAP.pension)
  const irp = take(MONTHLY_CAP.irp)
  const isa = take(MONTHLY_CAP.isa)
  const pensionExtra = take(MONTHLY_CAP.pensionExtra)
  return { pension, irp, isa, pensionExtra, cma: rest }
}

// 매달 m원씩 y년 적립 시 미래가치(월복리, 기말납입). r=연수익률
function futureValue(m, years, r) {
  if (m <= 0 || years <= 0) return 0
  const months = years * 12
  if (r <= 0) return m * months
  const mr = r / 12
  return m * ((Math.pow(1 + mr, months) - 1) / mr)
}

export default function TaxGuide() {
  const saved = { ...load(), ...fromUrl() }
  const [copied, setCopied] = useState(false)
  const [salaryMan, setSalaryMan] = useState(saved.salaryMan ?? '') // 월 실수령액(세후, 만원)
  const [savingMan, setSavingMan] = useState(saved.savingMan ?? '') // 월 저축액(만원)
  const [hasEmergency, setHasEmergency] = useState(saved.hasEmergency ?? 'no')
  const [age, setAge] = useState(saved.age ?? '') // 만 나이
  const [grossMan, setGrossMan] = useState(saved.grossMan ?? '') // 세전 연봉(만원, 선택)
  const [livingMan, setLivingMan] = useState(saved.livingMan ?? '') // 월 생활비(만원, 선택)
  const [returnPct, setReturnPct] = useState(saved.returnPct ?? '6') // 예상 연 수익률(%)
  const [prioritySel, setPrioritySel] = useState(saved.prioritySel ?? 'retire') // retire | midterm

  useEffect(() => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ salaryMan, savingMan, hasEmergency, age, grossMan, livingMan, returnPct, prioritySel }),
    )
  }, [salaryMan, savingMan, hasEmergency, age, grossMan, livingMan, returnPct, prioritySel])

  const salary = (Number(salaryMan) || 0) * 10000 // 월 실수령액(원)
  const saving = (Number(savingMan) || 0) * 10000 // 월저축(원)
  const grossYear = (Number(grossMan) || 0) * 10000 // 세전 연봉(원)
  const living = (Number(livingMan) || 0) * 10000 // 월 생활비(원)
  const ageNum = Number(age) || 0
  const ret = (Number(returnPct) || 0) / 100
  const annualNet = salary * 12

  // 세액공제율: 세전 연봉 있으면 정확, 없으면 실수령 기준 추정
  const rate = grossYear > 0 ? (grossYear > 55_000_000 ? 0.132 : 0.165) : annualNet > 46_000_000 ? 0.132 : 0.165
  const rateBasis = grossYear > 0 ? '세전 연봉 기준' : '실수령 기준 추정'

  // 비상금: 월 생활비 있으면 생활비×3, 없으면 실수령×3
  const emergencyTarget = (living > 0 ? living : salary) * 3
  const emgBasis = living > 0 ? '월 생활비 3개월' : '월 실수령 3개월'

  // 노후 우선(기본, 세액공제부터 챙김) / 중기목돈 우선(ISA 먼저)
  const priority = prioritySel === 'midterm' ? 'midterm' : 'retire'
  const alloc = useMemo(() => allocate(saving, priority), [saving, priority])

  const deductibleYear = (alloc.pension + alloc.irp) * 12 // 세액공제 대상(연)
  const refundYear = Math.round(deductibleYear * rate) // 예상 환급(연)

  // 미래 시뮬레이션
  const horizon = ageNum > 0 ? Math.max(1, PENSION_START_AGE - ageNum) : 30 // 투자기간(년)
  const investedMonthly = alloc.pension + alloc.irp + alloc.isa + alloc.pensionExtra // 실제 투자 금액(CMA 제외)
  const retireMonthly = alloc.pension + alloc.irp + alloc.pensionExtra // 연금성 자산
  const sim = useMemo(() => {
    const rows = []
    for (let y = 1; y <= horizon; y++) {
      const principal = investedMonthly * 12 * y
      const total = futureValue(investedMonthly, y, ret)
      rows.push({ year: y, principal: Math.round(principal), profit: Math.round(total - principal) })
    }
    const finalTotal = futureValue(investedMonthly, horizon, ret)
    const finalPrincipal = investedMonthly * 12 * horizon
    const retireFV = futureValue(retireMonthly, horizon, ret)
    const monthlyPension = Math.round(retireFV / (PAYOUT_YEARS * 12))
    return {
      rows,
      finalTotal: Math.round(finalTotal),
      finalPrincipal: Math.round(finalPrincipal),
      finalProfit: Math.round(finalTotal - finalPrincipal),
      monthlyPension,
      cumulativeRefund: refundYear * horizon,
    }
  }, [investedMonthly, retireMonthly, horizon, ret, refundYear])

  const buckets = [
    { key: 'pension', name: '연금저축', role: '노후 핵심 · 세액공제', concept: '자산배분 ETF', monthly: alloc.pension, capM: MONTHLY_CAP.pension, Icon: PiggyBank },
    { key: 'irp', name: 'IRP', role: '세액공제 보강 (합산 연 900만)', concept: 'TDF', monthly: alloc.irp, capM: MONTHLY_CAP.irp, Icon: Landmark },
    { key: 'isa', name: 'ISA', role: '중기 목돈 · 비과세/분리과세', concept: '배당', monthly: alloc.isa, capM: MONTHLY_CAP.isa, Icon: TrendingUp },
    { key: 'pensionExtra', name: '연금저축 추가납입', role: '세액공제 초과(안세공) · 과세이연', concept: '자산배분', monthly: alloc.pensionExtra, capM: MONTHLY_CAP.pensionExtra, Icon: PiggyBank },
    { key: 'cma', name: 'CMA', role: '남는 돈 · 대기자금', concept: '수시입출 파킹', monthly: alloc.cma, capM: null, Icon: Wallet },
  ]
  const pieData = buckets.filter((b) => b.monthly > 0).map((b) => ({ name: b.name, value: Math.round(b.monthly) }))
  const hasInput = salary > 0 && saving > 0

  const shareLink = async () => {
    const params = { salaryMan, savingMan, hasEmergency, age, grossMan, livingMan, returnPct, prioritySel }
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

  return (
    <div className="space-y-5">
      {/* 입력 */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Calculator size={18} className="text-indigo-300" />
          <h2 className="text-base font-semibold">절세계좌 투자 가이드</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="월 실수령액 (세후, 만원)" hint="매달 통장에 들어오는 금액">
            <Input type="number" inputMode="numeric" value={salaryMan} onChange={(e) => setSalaryMan(e.target.value)} placeholder="예: 300" />
          </Field>
          <Field label="월 저축 가능액 (만원)" hint="매달 투자에 넣을 금액">
            <Input type="number" inputMode="numeric" value={savingMan} onChange={(e) => setSavingMan(e.target.value)} placeholder="예: 100" />
          </Field>
          <Field label="비상금(CMA)" hint="3~6개월 생활비">
            <Select value={hasEmergency} onChange={(e) => setHasEmergency(e.target.value)}>
              <option value="no">아직 없음</option>
              <option value="yes">이미 있음</option>
            </Select>
          </Field>
        </div>

        <div className="mt-3">
          <input
            type="range"
            min="0"
            max="300"
            step="5"
            value={Number(savingMan) || 0}
            onChange={(e) => setSavingMan(e.target.value)}
            className="w-full accent-indigo-400"
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>월 저축 슬라이더: {fmtNum(Number(savingMan) || 0)}만원</span>
            <span>0 ~ 300만</span>
          </div>
        </div>

        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="mb-2 text-xs font-medium text-slate-400">정밀 · 시뮬레이션 설정 (선택)</div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Field label="만 나이" hint="투자기간·순서">
              <Input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="예: 35" />
            </Field>
            <Field label="세전 연봉 (만원)" hint="정확한 공제율">
              <Input type="number" inputMode="numeric" value={grossMan} onChange={(e) => setGrossMan(e.target.value)} placeholder="선택" />
            </Field>
            <Field label="월 생활비 (만원)" hint="비상금 계산">
              <Input type="number" inputMode="numeric" value={livingMan} onChange={(e) => setLivingMan(e.target.value)} placeholder="선택" />
            </Field>
            <Field label={`예상 연 수익률 — ${returnPct}%`} hint="복리 가정 (슬라이드)">
              <input
                type="range"
                min="3"
                max="10"
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
              월 실수령액과 월 저축액을 입력하면
              <br />
              절세계좌별 추천 배분과 미래 자산을 보여드려요.
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

          {/* 요약 */}
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
                  {hasEmergency === 'no' ? (
                    <Pill tone="amber">아직 없음 — 먼저 채우기</Pill>
                  ) : (
                    <Pill tone="green">확보됨 — 바로 투자</Pill>
                  )}
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

          {/* 미래 자산 시뮬레이션 */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <LineChart size={18} className="text-emerald-300" />
              <h3 className="text-base font-semibold">미래 자산 시뮬레이션</h3>
              <Pill tone="slate">
                {ageNum > 0 ? `${ageNum}세 → ${PENSION_START_AGE}세` : '기본 30년'} · 수익률 {returnPct}%
              </Pill>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-slate-400">{horizon}년 후 예상 총 평가액</div>
                <div className="tnum mt-1 text-2xl font-bold">{fmtNum(sim.finalTotal)}원</div>
                <div className="tnum mt-0.5 text-[11px] text-slate-500">
                  원금 {fmtNum(Math.round(sim.finalPrincipal / 10000))}만 + <span className="text-emerald-400">수익 {fmtNum(Math.round(sim.finalProfit / 10000))}만</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">예상 월 연금 ({PAYOUT_YEARS}년 수령)</div>
                <div className="tnum mt-1 text-2xl font-bold text-indigo-300">{fmtNum(sim.monthlyPension)}원</div>
                <div className="mt-0.5 text-[11px] text-slate-500">연금저축·IRP 기준</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">{horizon}년 누적 세액공제</div>
                <div className="tnum mt-1 text-2xl font-bold text-emerald-400">{fmtNum(sim.cumulativeRefund)}원</div>
                <div className="mt-0.5 text-[11px] text-slate-500">매년 환급액 합계</div>
              </div>
            </div>
            <div className="mt-4">
              <GrowthChart data={sim.rows} />
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: '#818cf8' }} /> 원금(누적 납입)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: '#34d399' }} /> 운용 수익
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">※ CMA(대기자금) 제외, 매달 같은 금액을 {returnPct}% 복리로 가정한 단순 추정입니다. 실제 수익률·세금에 따라 달라져요.</p>
          </Card>

          {/* 배분 시각화 + 계좌별 */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 text-sm font-medium text-slate-300">월 {fmtNum(saving)}원 배분</div>
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
