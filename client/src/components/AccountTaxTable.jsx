import { Table2, X } from 'lucide-react'
import { Card, Pill } from './ui.jsx'

// 계좌 유형별 과세 비교 (2026 기준 일반 정보 · 투자/세무 자문 아님)
// 각 칸은 줄 배열 — 첫 줄을 핵심으로 강조하고 나머지는 보조 설명으로 표시한다.
const ACCOUNTS = [
  {
    name: '일반 계좌',
    badge: { tone: 'slate', text: '절세 혜택 없음' },
    gains: ['양도소득세 22%', '연 250만원 기본공제', '5월 종합소득세 신고'],
    dividend: ['배당소득세 15.4% (원천징수)', '연 2,000만원 초과 시 종합과세'],
    deduction: ['없음'],
    withdrawal: ['해당 없음'],
    features: ['가장 기본 계좌, 절세 혜택 없음', '손익통산 가능 (국내주식은 별도)'],
  },
  {
    name: 'ISA',
    sub: '일반형',
    badge: { tone: 'green', text: '비과세·분리과세' },
    gains: ['계좌 내 비과세', '순이익 200만원까지 비과세', '초과분 9.9% 분리과세'],
    dividend: ['계좌 내 비과세', '배당·이자 포함 순이익으로 통산'],
    deduction: ['납입공제 없음', '연 2,000만원 · 5년 1억원 한도'],
    withdrawal: ['만기 해지 시 과세', '의무 가입기간 3년'],
    features: ['손익 통산 후 과세', '만기 후 연금계좌 이전 시 추가 세액공제 (이전금액의 10%, 최대 300만원)'],
  },
  {
    name: 'ISA',
    sub: '서민형',
    badge: { tone: 'green', text: '비과세 한도 2배' },
    gains: ['계좌 내 비과세', '순이익 400만원까지 비과세', '초과분 9.9% 분리과세'],
    dividend: ['계좌 내 비과세'],
    deduction: ['납입공제 없음'],
    withdrawal: ['만기 해지 시 과세'],
    features: ['소득 요건 충족 시 비과세 한도 2배'],
  },
  {
    name: 'IRP',
    sub: '개인형 퇴직연금',
    badge: { tone: 'green', text: '세액공제 16.5%' },
    gains: ['운용 중 비과세', '수령 시까지 과세 이연'],
    dividend: ['운용 중 비과세'],
    deduction: ['세액공제 16.5%', '연금저축 합산 최대 900만원', '총급여 5,500만원 이하 16.5%, 초과 13.2%'],
    withdrawal: ['연금 수령 시 3.3~5.5%', '55세 이후 연금 수령', '일시금 인출 시 기타소득세 16.5%'],
    features: ['연 1,800만원 납입 한도 (연금저축 포함)', '퇴직금 수령 가능'],
  },
  {
    name: '연금저축',
    sub: '펀드/보험',
    badge: { tone: 'green', text: '세액공제 16.5%' },
    gains: ['운용 중 비과세', '수령 시까지 과세 이연'],
    dividend: ['운용 중 비과세'],
    deduction: ['세액공제 16.5%', '연 600만원 한도', 'IRP와 합산 시 900만원'],
    withdrawal: ['연금 수령 시 3.3~5.5%', '55세 이후 연금 수령', '중도 해지 시 기타소득세 16.5%'],
    features: ['IRP 대비 투자 자산 제한 적음', '연금저축펀드는 ETF·펀드 투자 가능'],
  },
  {
    name: 'CMA',
    badge: { tone: 'slate', text: '절세 기능 없음' },
    gains: ['양도소득세 22%', '주식 매매 시 일반계좌와 동일'],
    dividend: ['이자·배당 15.4% (원천징수)', 'CMA 이자는 이자소득세 15.4%'],
    deduction: ['없음'],
    withdrawal: ['해당 없음'],
    features: ['입출금 자유', '잔액 자동 운용 (RP·MMF 등)', '절세 기능 없음'],
  },
]

const COLS = [
  { key: 'gains', label: '매매 차익 과세' },
  { key: 'dividend', label: '배당금 과세' },
  { key: 'deduction', label: '세액공제 / 납입공제' },
  { key: 'withdrawal', label: '인출·수령 시 과세' },
  { key: 'features', label: '주요 특징' },
]

function Lines({ items }) {
  return (
    <div className="space-y-1">
      {items.map((t, i) => (
        <div key={i} className={i === 0 ? 'text-slate-200' : 'text-[11px] leading-snug text-slate-400'}>
          {t}
        </div>
      ))}
    </div>
  )
}

function AccountName({ a, className = '' }) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-1.5 gap-y-1 ${className}`}>
      <span className="font-semibold text-slate-100">{a.name}</span>
      {a.sub && <span className="text-[11px] text-slate-400">{a.sub}</span>}
      {a.badge && <Pill tone={a.badge.tone}>{a.badge.text}</Pill>}
    </div>
  )
}

export default function AccountTaxTable({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <Card
        className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-b-none bg-[#0e1320] sm:max-h-[88vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Table2 size={18} className="text-indigo-300" /> 계좌별 과세 비교
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-auto px-4 py-4 sm:px-5">
          {/* 데스크톱: 비교 표 */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="sticky left-0 z-10 bg-[#0e1320] px-3 py-2 font-medium">계좌 유형</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="px-3 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACCOUNTS.map((a) => (
                  <tr key={`${a.name}-${a.sub ?? ''}`} className="border-b border-white/5 align-top">
                    <th className="sticky left-0 z-10 bg-[#0e1320] px-3 py-3 text-left">
                      <AccountName a={a} className="flex-col !items-start" />
                    </th>
                    {COLS.map((c) => (
                      <td key={c.key} className="px-3 py-3">
                        <Lines items={a[c.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일·태블릿: 계좌별 카드 */}
          <div className="space-y-3 lg:hidden">
            {ACCOUNTS.map((a) => (
              <Card key={`${a.name}-${a.sub ?? ''}`} className="p-3">
                <AccountName a={a} />
                <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5">
                  {COLS.map((c) => (
                    <div key={c.key} className="grid grid-cols-[5.5rem_1fr] gap-2">
                      <div className="text-[11px] leading-snug text-slate-500">{c.label}</div>
                      <div className="text-xs">
                        <Lines items={a[c.key]} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 px-5 py-3 text-[11px] leading-relaxed text-slate-500">
          ※ 2026년 기준 <b>참고용 일반 정보</b>입니다. 세율·한도·요건은 계좌·소득·시기에 따라 달라질 수 있으며 투자·세무 자문이 아닙니다. 정확한 내용은 증권사/국세청 기준을 확인하세요.
        </div>
      </Card>
    </div>
  )
}
