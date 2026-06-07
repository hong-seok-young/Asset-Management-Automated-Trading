// 계좌별 종목 추천 + 상황별(전술적) 리밸런싱 로직.
// 설계 근거는 /PORTFOLIO.md 참고. 모든 수치는 참고용·추정이며 투자자문이 아니다.

// ── 자산군(클래스) 메타 ─────────────────────────────────────────────
// equity=주식성 자산(하한 가드레일 대상). locked=리밸런싱에서 건드리지 않음(규제·현금성).
export const KLASS = {
  usStock: { label: '미국주식', equity: true, color: '#6366f1' },
  usGrowth: { label: '미국 성장', equity: true, color: '#8b5cf6' },
  dividend: { label: '미국 배당', equity: true, color: '#ec4899' },
  reit: { label: '리츠', equity: true, color: '#f97316' },
  gold: { label: '금', equity: false, color: '#eab308' },
  longBond: { label: '장기채', equity: false, color: '#10b981' },
  tdf: { label: 'TDF(안전자산)', equity: false, color: '#14b8a6', locked: true },
  cash: { label: '현금성', equity: false, color: '#64748b', locked: true },
}

// ── 계좌별 베이스 포트폴리오 (공격형·사회초년생) ────────────────────
// pension/pensionExtra/irp/isa/cma 키는 TaxGuide 의 월 배분액(alloc)과 매칭된다.
// annualReturn = 해당 자산의 장기 연평균 수익률(CAGR) 추정치(%). 참고용 가정이며 미래를 보장하지 않는다.
export const BASE_ACCOUNTS = [
  {
    key: 'pension',
    name: '연금저축',
    note: '노후 핵심 · 가장 장기 → 가장 공격적',
    constraint: '국내상장 ETF·펀드만 (개별주식 불가)',
    equityFloor: 60,
    holdings: [
      { ticker: '133690', name: 'TIGER 미국나스닥100', klass: 'usGrowth', role: '미국 성장 코어(빅테크)', weight: 80, expense: 0.0068, annualReturn: 13 },
      { ticker: '411060', name: 'TIGER KRX금현물', klass: 'gold', role: '무상관 분산', weight: 12, expense: 0.15, annualReturn: 7 },
      { ticker: '481060', name: 'KODEX 미국30년국채액티브(H)', klass: 'longBond', role: '위기 완충', weight: 8, expense: 0.05, annualReturn: 4 },
    ],
  },
  {
    key: 'pensionExtra',
    name: '연금저축 추가납입',
    note: '세액공제 초과분 · 연금저축과 동일 바스켓',
    constraint: '국내상장 ETF·펀드만',
    equityFloor: 60,
    sameAs: 'pension',
    holdings: [
      { ticker: '133690', name: 'TIGER 미국나스닥100', klass: 'usGrowth', role: '미국 성장 코어(빅테크)', weight: 80, expense: 0.0068, annualReturn: 13 },
      { ticker: '411060', name: 'TIGER KRX금현물', klass: 'gold', role: '무상관 분산', weight: 12, expense: 0.15, annualReturn: 7 },
      { ticker: '481060', name: 'KODEX 미국30년국채액티브(H)', klass: 'longBond', role: '위기 완충', weight: 8, expense: 0.05, annualReturn: 4 },
    ],
  },
  {
    key: 'irp',
    name: 'IRP',
    note: '위험자산 70% 한도 → TDF로 우회, 실질 주식 90%대',
    constraint: '국내상장 ETF·펀드만 · 위험자산 70% 한도',
    equityFloor: 60,
    holdings: [
      { ticker: '133690', name: 'TIGER 미국나스닥100', klass: 'usGrowth', role: '위험자산 코어(나스닥100)', weight: 70, expense: 0.0068, annualReturn: 13 },
      { ticker: '434060', name: 'KODEX TDF2050액티브', klass: 'tdf', role: '안전자산 30% 의무(내부 주식 ~80%)', weight: 30, expense: 0.3, annualReturn: 7.5 },
    ],
  },
  {
    key: 'isa',
    name: 'ISA',
    note: '중기 · 배당 분리과세를 살리는 구성',
    constraint: '국내상장 ETF + 국내 개별주식 (해외주식 직접매수 불가)',
    equityFloor: 55,
    holdings: [
      { ticker: '458730', name: 'TIGER 미국배당다우존스(SCHD)', klass: 'dividend', role: '월배당·분리과세 핵심', weight: 40, expense: 0.11, annualReturn: 11 },
      { ticker: '133690', name: 'TIGER 미국나스닥100', klass: 'usGrowth', role: '성장', weight: 40, expense: 0.0068, annualReturn: 13 },
      { ticker: '329200', name: 'TIGER 리츠부동산인프라', klass: 'reit', role: '배당·분리과세', weight: 20, expense: 0.29, annualReturn: 7 },
    ],
  },
  {
    key: 'cma',
    name: 'CMA',
    note: '비상금 · 대기자금 파킹',
    constraint: 'RP/발행어음 자동운용 (또는 파킹형 ETF)',
    equityFloor: 0,
    holdings: [
      { ticker: '459580', name: 'KODEX CD금리액티브', klass: 'cash', role: '수시입출 파킹', weight: 100, expense: 0.02, annualReturn: 3.5 },
    ],
  },
]

// 투자(성장) 계좌 — CMA(현금성 파킹)는 수익률 블렌드에서 제외
export const INVEST_ACCOUNT_KEYS = ['pension', 'pensionExtra', 'irp', 'isa']

// 현재가 시드(원) — 시세 자동조회가 안 될 때(예: 프론트만 배포) 기본값으로 채워 정수 주수를 계산한다.
// 2026-06 조회 기준 근사치. 실제 매수 전 증권사 현재가로 갱신할 것.
export const DEFAULT_PRICE = {
  '133690': 205500, // TIGER 미국나스닥100
  '411060': 16476, // TIGER KRX금현물
  '481060': 8585, // KODEX 미국30년국채액티브(H)
  '458730': 13500, // TIGER 미국배당다우존스(SCHD)
  '329200': 4600, // TIGER 리츠부동산인프라
  '434060': 16500, // KODEX TDF2050액티브
  '459580': 1080000, // KODEX CD금리액티브 (CMA·매수 UI 미사용)
  '360750': 21000, // TIGER 미국S&P500 (현재 미사용)
}

// ── 시장 신호 → 국면 판정 ───────────────────────────────────────────
// signals: { fx:{price}, sp500:{fromHigh}, nasdaq:{fromHigh}, ust10y:{price} }
// 각 항목 level: 'high' | 'mid' | 'low'
export function classifyRegime(signals = {}) {
  const fxPrice = signals.fx?.price
  const fx =
    fxPrice == null ? null : { level: fxPrice > 1400 ? 'high' : fxPrice < 1300 ? 'low' : 'mid', value: fxPrice }

  // 밸류: S&P·나스닥 중 더 고점에 가까운 쪽으로 판정(둘 중 하나라도 신고가권이면 고평가 경계)
  const fhArr = [signals.sp500?.fromHigh, signals.nasdaq?.fromHigh].filter((x) => x != null)
  const fromHigh = fhArr.length ? Math.max(...fhArr) : null // -2 이면 고점 2% 아래
  const val =
    fromHigh == null ? null : { level: fromHigh >= -2 ? 'high' : fromHigh <= -15 ? 'low' : 'mid', value: fromHigh }

  const y = signals.ust10y?.price
  const rate = y == null ? null : { level: y > 4.5 ? 'high' : y < 3.0 ? 'low' : 'mid', value: y }

  return { fx, val, rate }
}

const FX_TXT = { high: '환율 높음', mid: '환율 보통', low: '환율 낮음' }
const VAL_TXT = { high: '증시 신고가권(고평가)', mid: '증시 보통', low: '증시 저평가' }
const RATE_TXT = { high: '금리 높음', mid: '금리 보통', low: '금리 낮음' }

export function regimeSummary(regime) {
  const parts = []
  if (regime.fx) parts.push(FX_TXT[regime.fx.level])
  if (regime.val) parts.push(VAL_TXT[regime.val.level])
  if (regime.rate) parts.push(RATE_TXT[regime.rate.level])
  return parts.join(' · ')
}

export const REGIME_LABEL = { fx: FX_TXT, val: VAL_TXT, rate: RATE_TXT }

// ── 리밸런싱 모드 ───────────────────────────────────────────────────
export const MODES = [
  { key: 'hold', name: '적립 유지', desc: '신호 무시 · 베이스 그대로 적립', intensity: 0, riskOff: 0 },
  { key: 'balanced', name: '균형 틸트', desc: '현 국면을 표준 강도로 반영 (추천)', intensity: 1, riskOff: 0, recommended: true },
  { key: 'defensive', name: '방어 틸트', desc: '균형 + 추가 위험회피', intensity: 1, riskOff: 6 },
]

const STEP = 7 // 신호 1개 극단당 최대 가감(%p)

// 국면 → 자산군별 목표 가감(%p). 양수=비중↑.
function classDeltas(regime, mode) {
  const d = {}
  const add = (k, v) => {
    d[k] = (d[k] || 0) + v
  }
  if (regime.fx?.level === 'high') {
    add('usStock', -STEP)
    add('usGrowth', -STEP)
    add('gold', STEP)
    add('cash', STEP)
  } else if (regime.fx?.level === 'low') {
    add('usStock', STEP)
    add('usGrowth', STEP)
  }
  if (regime.val?.level === 'high') {
    add('usStock', -STEP * 0.6)
    add('usGrowth', -STEP) // 성장(나스닥)이 밸류에 더 민감 → 더 크게 축소
    add('gold', STEP * 0.6)
    add('longBond', STEP * 0.6)
  } else if (regime.val?.level === 'low') {
    add('usStock', STEP * 0.6)
    add('usGrowth', STEP)
  }
  if (regime.rate?.level === 'high') {
    add('longBond', STEP) // 금리 인하 기대 → 장기채 자본차익
  } else if (regime.rate?.level === 'low') {
    add('longBond', -STEP) // 금리 낮을 때 장기채 추가는 피함
    add('cash', STEP * 0.5)
    add('gold', STEP * 0.5)
  }
  // 방어 틸트: 주식성↓ · 안전자산↑ 추가 바이어스
  if (mode.riskOff) {
    add('usStock', -mode.riskOff)
    add('usGrowth', -mode.riskOff)
    add('gold', mode.riskOff * 0.5)
    add('longBond', mode.riskOff * 0.5)
    add('cash', mode.riskOff)
  }
  const f = mode.intensity
  for (const k of Object.keys(d)) d[k] *= f
  return d
}

// 베이스 holdings + 국면 + 모드 → 조정된 holdings (weight 정수, 합계 100, delta 포함)
export function tiltAccount(account, regime, modeKey) {
  const mode = MODES.find((m) => m.key === modeKey) || MODES[0]
  const base = account.holdings.map((h) => ({ ...h }))
  if (mode.key === 'hold' || !regime) {
    return base.map((h) => ({ ...h, weight: h.weight, delta: 0 }))
  }
  const deltas = classDeltas(regime, mode)

  // 클래스 가감을 해당 클래스 내 종목에 베이스 비중대로 분배. 잠금 클래스는 제외.
  const classBase = {}
  for (const h of base) if (!KLASS[h.klass]?.locked) classBase[h.klass] = (classBase[h.klass] || 0) + h.weight

  let w = base.map((h) => {
    if (KLASS[h.klass]?.locked) return h.weight // 잠금(TDF·현금성)은 고정
    const dk = deltas[h.klass]
    if (!dk || !classBase[h.klass]) return h.weight
    return h.weight + dk * (h.weight / classBase[h.klass])
  })
  w = w.map((x) => Math.max(0, x))

  // 먼저 합계 100으로 정규화한 뒤(% 기준) 가드레일을 적용한다.
  const total = w.reduce((s, x) => s + x, 0) || 1
  w = w.map((x) => (x / total) * 100)

  // 주식 하한 가드레일: 부족하면 비주식(잠금 제외)에서 끌어와 주식에 보충 (합계 100 유지)
  const isEq = (i) => KLASS[base[i].klass]?.equity
  const isLocked = (i) => KLASS[base[i].klass]?.locked
  const sum = (pred) => w.reduce((s, x, i) => (pred(i) ? s + x : s), 0)
  const floor = account.equityFloor || 0
  const eqSum = sum(isEq)
  const nonEqAdj = sum((i) => !isEq(i) && !isLocked(i))
  if (floor > 0 && eqSum < floor && nonEqAdj > 0) {
    const need = Math.min(floor - eqSum, nonEqAdj)
    for (let i = 0; i < w.length; i++) if (!isEq(i) && !isLocked(i)) w[i] -= need * (w[i] / nonEqAdj)
    for (let i = 0; i < w.length; i++) if (isEq(i)) w[i] += need * (w[i] / eqSum)
  }

  // 정수 반올림(잔차는 최대 종목에서 보정)
  const rounded = w.map((x) => Math.round(x))
  const diff = 100 - rounded.reduce((s, x) => s + x, 0)
  if (diff !== 0) {
    let mi = 0
    for (let i = 1; i < rounded.length; i++) if (rounded[i] > rounded[mi]) mi = i
    rounded[mi] += diff
  }
  return base.map((h, i) => ({ ...h, weight: rounded[i], delta: rounded[i] - h.weight }))
}

// 가중평균 보수율(%)
export function blendedExpense(holdings) {
  const tot = holdings.reduce((s, h) => s + h.weight, 0) || 1
  return holdings.reduce((s, h) => s + h.expense * h.weight, 0) / tot
}

// 가중평균 연평균 수익률(%) — 종목 비중으로 블렌드
export function blendedReturn(holdings) {
  const tot = holdings.reduce((s, h) => s + h.weight, 0) || 1
  return holdings.reduce((s, h) => s + (h.annualReturn || 0) * h.weight, 0) / tot
}

// 월 배분액(alloc)으로 가중한 전체 추천 포트폴리오의 기대 연평균 수익률(%).
// 베이스 비중(장기 기준, 전술 틸트 제외)을 쓰고, CMA(현금성)는 제외한다.
// 배분액 정보가 없으면 연금저축 베이스 블렌드를 대표값으로 돌려준다.
export function expectedReturnFromAlloc(alloc = {}) {
  let wSum = 0
  let acc = 0
  for (const a of BASE_ACCOUNTS) {
    if (!INVEST_ACCOUNT_KEYS.includes(a.key)) continue
    const m = Math.max(0, alloc[a.key] || 0)
    if (m <= 0) continue
    acc += blendedReturn(a.holdings) * m
    wSum += m
  }
  if (wSum > 0) return acc / wSum
  const p = BASE_ACCOUNTS.find((a) => a.key === 'pension')
  return blendedReturn(p.holdings)
}

// ── 기능별 설명 팝업 텍스트 (?) ─────────────────────────────────────
export const EXPLAIN = {
  fx: {
    title: '환율(원/달러)이 비중에 미치는 영향',
    body: '환율이 높을 때(원화 약세) 미국 ETF를 원화로 사면 비싸게 환전해 사는 셈이라, 환율이 떨어지면 환차손이 납니다. 그래서 환율이 높으면 미국 환노출 주식 신규 비중을 줄이고 금·현금성을 늘립니다. 환율이 낮으면 달러 자산을 싸게 담을 기회로 보고 미국주식을 늘립니다.',
  },
  val: {
    title: '밸류에이션(신고가)이 비중에 미치는 영향',
    body: '지수가 52주 신고가에 붙어 있으면 그만큼 기대수익은 낮고 조정 위험은 큽니다. 고평가 구간에선 주식(특히 변동성 큰 나스닥)을 줄이고 금·채권을 늘립니다. 저평가(고점 대비 많이 빠진) 구간에선 주식을 늘립니다. 단 적립 자체는 멈추지 않습니다.',
  },
  rate: {
    title: '금리(미국채 10년)가 비중에 미치는 영향',
    body: '금리가 높을 때(향후 인하 기대)는 장기채가 유리합니다 — 금리가 내려가면 장기채 가격이 크게 오르기 때문(자본차익). 반대로 금리가 이미 낮으면 장기채 추가 매수는 향후 금리상승=가격하락 위험이 커서 비중을 줄이고, 현금성(CD금리)·금으로 옮깁니다.',
  },
  gold: {
    title: '금은 언제 늘리고 줄이나',
    body: '금은 주식과 잘 따로 움직이는(무상관) 분산 자산입니다. 환율이 높거나, 증시가 고평가거나, 금리가 낮아 실질금리가 떨어질 때 늘립니다. 반대로 환율이 낮고 증시가 저평가이며 금리가 높을 때는 비중을 줄입니다.',
  },
  longBond: {
    title: '장기채는 언제 늘리고 줄이나',
    body: '장기채는 금리에 민감합니다. 금리가 높을 때(인하 사이클 기대) 늘리면 금리 하락 시 가격 상승으로 이득을 봅니다. 금리가 낮을 때 늘리면 향후 금리상승에 크게 손실 볼 수 있어 줄입니다. 평소엔 주식이 빠질 때 완충 역할을 합니다.',
  },
  tdf: {
    title: 'IRP의 TDF 30%는 왜 고정인가',
    body: 'IRP는 위험자산(주식형)을 70%까지만 담을 수 있고 30%는 안전자산이어야 합니다. TDF(타깃데이트펀드)는 안전자산으로 분류되지만 내부적으로 주식을 80% 안팎 담고 있어, TDF를 30% 안전자산 칸에 넣으면 규제를 지키면서도 실질 주식 비중을 90%대로 끌어올릴 수 있습니다. 규제 칸이라 리밸런싱에서 건드리지 않습니다.',
  },
  cma: {
    title: 'CMA는 왜 종목이 아닌가',
    body: 'CMA는 비상금·대기자금을 하루만 넣어도 이자가 붙는 파킹 통장입니다. 증권사 RP/발행어음으로 자동 운용되며, 굳이 ETF로 굴린다면 CD금리 추종 ETF(예: KODEX CD금리액티브, 총보수 0.02%)를 씁니다.',
  },
  dividend: {
    title: 'ISA에 배당(SCHD)을 넣는 이유',
    body: 'ISA는 순이익 비과세(일반 200만/서민형 400만) + 초과분 9.9% 분리과세 혜택이 있어, 배당이 많이 나오는 자산을 넣을수록 절세효과가 큽니다. 미국배당다우존스(SCHD)는 배당성장+분리과세 궁합이 좋아 ISA의 핵심으로 둡니다.',
  },
  reit: {
    title: '리츠(부동산)를 넣는 이유',
    body: '리츠는 임대수익 기반으로 배당이 꾸준해 ISA의 분리과세 효과를 키우고, 주식·채권과 다른 흐름으로 분산 효과도 줍니다.',
  },
  mode: {
    title: '세 가지 모드 차이',
    body: '적립 유지 = 신호를 무시하고 베이스대로(마켓타이밍 안 함). 균형 틸트 = 현 국면을 표준 강도로 반영(추천·"자동으로 맞춰줘"가 선택). 방어 틸트 = 균형보다 더 보수적으로 주식을 줄이고 안전자산을 늘림.',
  },
  rebalance: {
    title: '리밸런싱은 어떻게 하나',
    body: '여기 비율은 "지금 다 팔고 갈아타라"가 아니라, 주로 이번 달 새로 넣는 적립금의 비중을 이렇게 맞추라는 의미입니다. 보유분은 분기·반기처럼 가끔, 목표 비중에서 많이 벗어났을 때만 조정하면 충분합니다.',
  },
  expense: {
    title: '총보수(보수율)란',
    body: '운용사가 떼는 연간 수수료입니다. 같은 지수를 따르는 ETF면 보수가 낮을수록 장기 수익에 유리합니다. 예) 0.0068%는 1,000만원당 연 680원 수준으로 사실상 0에 수렴합니다.',
  },
  return: {
    title: '예상 수익률 — 종목 평균은 어떻게 나오나',
    body: '각 종목의 장기 연평균 수익률(CAGR) 추정치를 비중으로 가중평균한 값입니다(예: 미국S&P500 10% · 나스닥100 13% · 금 7% · 장기채 4% · 배당 11% · TDF 7.5%). 자산 성장 그래프의 수익률이 이 블렌드로 자동 설정돼, 추천 종목 구성과 일관되게 미래 자산을 추정합니다. 과거 평균일 뿐 미래를 보장하지 않습니다.',
  },
}
