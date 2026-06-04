import { AlertTriangle, Check, ChevronDown, ListChecks } from 'lucide-react'
import { Card } from './ui.jsx'

// 각 절세계좌 설명 · 혜택 · 주의(출금제약/페널티). 일반 정보(2026 기준), 투자 자문 아님.
const ACCOUNTS = [
  {
    name: '연금저축',
    summary: '노후 핵심 · 세액공제 연 600만',
    benefits: [
      '납입액(연 600만 한도)에 16.5%/13.2% 세액공제',
      '계좌 안 운용수익은 인출 전까지 과세이연(복리에 유리)',
      '국내외 ETF·펀드 등 자유롭게 운용',
    ],
    cautions: [
      '연금 수령은 만 55세 이후 + 가입 5년 이상',
      '중도해지·연금 외 인출 시 세액공제분+수익에 기타소득세 16.5%',
      '단, 세액공제 안 받은 추가납입(안세공) 원금은 페널티 없이 인출 가능',
    ],
  },
  {
    name: 'IRP',
    summary: '세액공제 보강 (연금저축과 합산 900만)',
    benefits: ['연금저축과 합산 연 900만까지 세액공제', '퇴직금도 받는 계좌 · 과세이연', 'TDF 등으로 알아서 굴리기 좋음'],
    cautions: ['중도 인출이 까다로움(법정 사유 외엔 사실상 전액 해지)', '위험자산(주식형) 70% 한도', '계좌·운용 수수료가 붙을 수 있음(상품 확인)'],
  },
  {
    name: 'ISA',
    summary: '중기 목돈 · 만능 절세통장',
    benefits: ['순이익 비과세(일반 200만 / 서민형 400만), 초과분 9.9% 분리과세', '손익통산(손실과 이익 상계)', '원금 범위 내 중도인출 가능 → 중기 자금에 유연'],
    cautions: ['의무 가입기간 3년', '납입한도 연 2,000만 · 총 1억', '만기자금을 연금계좌로 옮기면 추가 납입한도 인정(10%·최대 300만)'],
  },
  {
    name: 'CMA',
    summary: '비상금 · 대기자금 파킹',
    benefits: ['수시 입출금 + 하루만 넣어도 이자', '비상금·투자 대기자금 보관에 적합'],
    cautions: ['RP형 등은 예금자보호 대상이 아님(상품별 확인)', '투자형은 원금 변동 가능'],
  },
]

const CHECKLIST = [
  '비상금(CMA) 3~6개월치 먼저 확보',
  '연금저축계좌 개설 → 월 50만(연 600) 세액공제 채우기',
  'IRP 개설 → 월 25만(연 300)으로 합산 900만 완성',
  '여유가 더 있으면 ISA 개설 → 납입',
  '연말정산 반영하려면 12/31까지 입금',
  '매달 자동이체 걸어두기(까먹음 방지)',
]

function AccountItem({ a }) {
  return (
    <details className="group border-b border-white/10 py-2 last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline gap-2">
          <span className="font-semibold">{a.name}</span>
          <span className="text-xs text-slate-400">{a.summary}</span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-slate-500 transition group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-2 pl-1 text-xs">
        <div className="space-y-1">
          {a.benefits.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5 text-slate-300">
              <Check size={13} className="mt-0.5 shrink-0 text-emerald-400" />
              <span>{t}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {a.cautions.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5 text-slate-400">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}

export default function AccountGuide() {
  return (
    <Card className="p-5">
      <h3 className="mb-1 text-base font-semibold">계좌 가이드 · 주의사항</h3>
      <p className="mb-3 text-xs text-slate-500">각 계좌를 누르면 혜택과 주의점(출금 제약·페널티)이 펼쳐져요.</p>
      <div>
        {ACCOUNTS.map((a) => (
          <AccountItem key={a.name} a={a} />
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-white/[0.03] p-4">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-200">
          <ListChecks size={16} className="text-indigo-300" /> 개설 순서 체크리스트
        </div>
        <ol className="space-y-1.5">
          {CHECKLIST.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-300">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  )
}
