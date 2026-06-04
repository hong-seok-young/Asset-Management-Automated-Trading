import { useEffect, useMemo, useState } from 'react'
import { Calculator, Info, Landmark, PiggyBank, TrendingUp, Wallet } from 'lucide-react'
import { Card, Field, Input, Pill, Select } from '../components/ui.jsx'
import { fmtNum } from '../lib/format.js'
import AllocationPie, { COLORS } from '../components/AllocationPie.jsx'

const LS_KEY = 'taxguide.inputs.v2'
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {}
  } catch {
    return {}
  }
}

// 월 납입 한도(원) — 2026 기준, 박곰희 '노후 우선' 순서로 채운다.
const MONTHLY_CAP = {
  pension: 500_000, // 연금저축 세액공제 한도 연 600만
  irp: 250_000, // IRP 추가 세액공제 연 300만 (연금저축 합산 900만)
  isa: 20_000_000 / 12, // ISA 납입한도 연 2,000만
  pensionExtra: 750_000, // 연금계좌 총 1,800만 − 세액공제 900만 = 추가 900만(안세공)
}

// 월 저축액을 우선순위대로 폭포수 배분
function allocate(saving) {
  let rest = Math.max(0, saving || 0)
  const take = (cap) => {
    const a = Math.min(rest, cap)
    rest -= a
    return a
  }
  return {
    pension: take(MONTHLY_CAP.pension),
    irp: take(MONTHLY_CAP.irp),
    isa: take(MONTHLY_CAP.isa),
    pensionExtra: take(MONTHLY_CAP.pensionExtra),
    cma: rest, // 남는 돈
  }
}

export default function TaxGuide() {
  const saved = load()
  const [salaryMan, setSalaryMan] = useState(saved.salaryMan ?? '') // 월 실수령액(세후, 만원)
  const [savingMan, setSavingMan] = useState(saved.savingMan ?? '') // 월 저축액(만원)
  const [hasEmergency, setHasEmergency] = useState(saved.hasEmergency ?? 'no')

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ salaryMan, savingMan, hasEmergency }))
  }, [salaryMan, savingMan, hasEmergency])

  const salary = (Number(salaryMan) || 0) * 10000 // 월 실수령액(세후, 원)
  const saving = (Number(savingMan) || 0) * 10000 // 월저축(원)
  const annualNet = salary * 12 // 연 실수령(세후)
  // 세액공제율: 총급여 5,500만(≈ 세후 연 4,600만) 경계로 추정. 실수령 입력이라 근사값.
  const rate = annualNet > 46_000_000 ? 0.132 : 0.165
  const emergencyTarget = salary * 3 // 비상금 권장(세후 약 3개월치)

  const alloc = useMemo(() => allocate(saving), [saving])
  const deductibleYear = (alloc.pension + alloc.irp) * 12 // 세액공제 대상(연)
  const refundYear = Math.round(deductibleYear * rate) // 예상 환급(연)

  const buckets = [
    { key: 'pension', name: '연금저축', role: '노후 핵심 · 세액공제', concept: '자산배분 ETF', monthly: alloc.pension, capM: MONTHLY_CAP.pension, Icon: PiggyBank },
    { key: 'irp', name: 'IRP', role: '세액공제 보강 (합산 연 900만)', concept: 'TDF', monthly: alloc.irp, capM: MONTHLY_CAP.irp, Icon: Landmark },
    { key: 'isa', name: 'ISA', role: '중기 목돈 · 비과세/분리과세', concept: '배당', monthly: alloc.isa, capM: MONTHLY_CAP.isa, Icon: TrendingUp },
    { key: 'pensionExtra', name: '연금저축 추가납입', role: '세액공제 초과(안세공) · 과세이연', concept: '자산배분', monthly: alloc.pensionExtra, capM: MONTHLY_CAP.pensionExtra, Icon: PiggyBank },
    { key: 'cma', name: 'CMA', role: '남는 돈 · 대기자금', concept: '수시입출 파킹', monthly: alloc.cma, capM: null, Icon: Wallet },
  ]
  const pieData = buckets.filter((b) => b.monthly > 0).map((b) => ({ name: b.name, value: Math.round(b.monthly) }))
  const hasInput = salary > 0 && saving > 0

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
      </Card>

      {!hasInput ? (
        <Card className="p-4">
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-slate-500">
            <Calculator size={28} className="text-slate-600" />
            <div>
              월 실수령액과 월 저축액을 입력하면
              <br />
              절세계좌별 추천 배분을 보여드려요.
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* 요약 */}
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm text-slate-400">예상 연 세액공제 환급액</div>
                <div className="tnum mt-1 text-3xl font-bold text-emerald-400">{fmtNum(refundYear)}원</div>
                <div className="mt-1 text-xs text-slate-500">
                  연 실수령 {fmtNum(Math.round(annualNet / 10000))}만원(세후) → 세액공제율 {(rate * 100).toFixed(1)}% (추정) · 공제대상 {fmtNum(Math.round(deductibleYear / 10000))}만원/년
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-400">권장 비상금 (CMA)</div>
                <div className="tnum mt-1 text-2xl font-bold">{fmtNum(emergencyTarget)}원</div>
                <div className="mt-1">
                  {hasEmergency === 'no' ? (
                    <Pill tone="amber">아직 없음 — 투자보다 먼저 채우기</Pill>
                  ) : (
                    <Pill tone="green">확보됨 — 바로 투자 진행</Pill>
                  )}
                </div>
              </div>
            </div>
            {hasEmergency === 'no' && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>
                  아래 배분은 <b>비상금을 다 모은 뒤</b> 기준이에요. 그 전에는 매달 저축을 먼저 CMA에 모아 {fmtNum(emergencyTarget)}원(약 3개월치)을 만든 다음 시작하세요.
                </span>
              </div>
            )}
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

          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            ※ 박곰희 작가의 절세계좌 전략과 2026년 세제 한도를 참고한 <b>참고용 가이드</b>입니다. 세액공제율은 실수령액 기준 추정이며, 투자 자문·권유가 아닙니다. 실제 납입·투자 판단과 손익은 본인 책임이며, 세부 한도·요건은 가입 증권사/국세청 기준을 확인하세요.
          </p>
        </>
      )}
    </div>
  )
}
