export function fmtNum(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return '-'
  return Number(n).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function fmtPrice(n, currency) {
  if (n == null || Number.isNaN(Number(n))) return '-'
  const v = Number(n)
  if (currency === 'USD' || currency === 'USDT') return '$' + fmtNum(v, 2)
  if (currency === 'KRW') return fmtNum(Math.round(v)) + '원'
  return fmtNum(v, v < 10 ? 4 : 2)
}

export function fmtPct(n, withSign = true) {
  if (n == null || Number.isNaN(Number(n))) return '-'
  const v = Number(n)
  return (withSign && v >= 0 ? '+' : '') + v.toFixed(2) + '%'
}

// 한국식 색상 관례: 상승=빨강, 하락=파랑
export function tone(n) {
  if (n == null || Number.isNaN(Number(n)) || Number(n) === 0) return 'text-slate-400'
  return Number(n) > 0 ? 'text-rose-400' : 'text-sky-400'
}

export function toneBg(n) {
  if (n == null || Number.isNaN(Number(n)) || Number(n) === 0) return 'bg-slate-500/15 text-slate-300'
  return Number(n) > 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-sky-500/15 text-sky-300'
}
