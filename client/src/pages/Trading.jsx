import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, ShieldAlert } from 'lucide-react'
import { cryptoApi } from '../api.js'
import { Card, Pill } from '../components/ui.jsx'
import { fmtNum } from '../lib/format.js'
import BacktestPanel from '../components/BacktestPanel.jsx'
import BotManager from '../components/BotManager.jsx'

function SafetyBanner({ status }) {
  if (!status) return null
  const { exchanges, limits, defaultMode } = status
  const anyKeys = exchanges.binance.keysReady || exchanges.upbit.keysReady

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        {anyKeys ? (
          <ShieldAlert className="mt-0.5 shrink-0 text-amber-400" size={20} />
        ) : (
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-400" size={20} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">거래 안전 상태</span>
            <Pill tone={defaultMode === 'live' ? 'red' : 'green'}>
              기본 모드: {defaultMode === 'live' ? '실거래' : '모의(paper)'}
            </Pill>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {anyKeys
              ? 'API 키가 설정되어 있습니다. 실거래 모드로 전환된 봇은 실제 자산으로 주문합니다. 주의하세요.'
              : 'API 키가 없어 모의·백테스트만 가능합니다. (안전) 실거래하려면 server/.env에 키를 넣으세요.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <KeyChip name="바이낸스" ex={exchanges.binance} />
            <KeyChip name="업비트" ex={exchanges.upbit} />
            <Pill tone="slate">
              <KeyRound size={11} /> 1회 한도: {fmtNum(limits.maxOrderUsdt)} USDT / {fmtNum(limits.maxOrderKrw)} KRW
            </Pill>
            <Pill tone="slate">일일 {limits.maxTradesPerDay}회</Pill>
          </div>
        </div>
      </div>
    </Card>
  )
}

function KeyChip({ name, ex }) {
  return (
    <Pill tone={ex.keysReady ? 'amber' : 'slate'}>
      {name}: {ex.keysReady ? '키 연결됨' : '키 없음'}
      {ex.testnet && ex.keysReady ? ' (테스트넷)' : ''}
    </Pill>
  )
}

export default function Trading() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    cryptoApi.status().then(setStatus).catch(() => {})
    const i = setInterval(() => cryptoApi.status().then(setStatus).catch(() => {}), 15000)
    return () => clearInterval(i)
  }, [])

  return (
    <div className="space-y-5">
      <SafetyBanner status={status} />
      <BacktestPanel />
      <BotManager status={status} />
    </div>
  )
}
