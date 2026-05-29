import { useEffect, useState } from 'react'
import { AlertTriangle, Plus, Power, Trash2, X, Zap } from 'lucide-react'
import { cryptoApi } from '../api.js'
import { Button, Card, Empty, Field, Input, Pill, Select } from './ui.jsx'
import { fmtNum, fmtPct, fmtPrice, tone } from '../lib/format.js'
import { EXCHANGE_LABEL, MARKETS, TIMEFRAMES } from '../lib/markets.js'
import StrategyEditor from './StrategyEditor.jsx'

const strategySummary = (s) =>
  s.type === 'rsi' ? `RSI${s.period} ${s.oversold}/${s.overbought}` : `MA ${s.fast}/${s.slow}`

const timeAgo = (ts) => {
  if (!ts) return '없음'
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 60) return `${sec}초 전`
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`
  return `${Math.floor(sec / 86400)}일 전`
}

function Toggle({ on, onClick, disabled }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        on ? 'bg-emerald-500' : 'bg-white/15'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          on ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export default function BotManager({ status }) {
  const [bots, setBots] = useState([])
  const [trades, setTrades] = useState([])
  const [logs, setLogs] = useState([])
  const [showCreate, setShowCreate] = useState(false)

  async function refresh() {
    try {
      const [b, t, l] = await Promise.all([cryptoApi.bots(), cryptoApi.trades(), cryptoApi.logs()])
      setBots(b)
      setTrades(t)
      setLogs(l)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh()
    const i = setInterval(refresh, 10000)
    return () => clearInterval(i)
  }, [])

  async function toggleEnabled(bot) {
    if (!bot.enabled && bot.mode === 'live') {
      if (!confirm('⚠️ 실거래 봇을 가동합니다.\n실제 자산으로 주문이 실행됩니다. 계속할까요?')) return
    }
    await cryptoApi.updateBot(bot.id, { enabled: !bot.enabled })
    refresh()
  }

  async function switchMode(bot, mode) {
    if (mode === 'live') {
      if (!bot.keysReady) {
        alert('실거래로 전환하려면 서버 .env 파일에 해당 거래소 API 키를 설정해야 합니다.')
        return
      }
      if (!confirm('실거래 모드로 전환합니다.\n가동 시 실제 주문이 나갑니다. 계속할까요?')) return
    }
    await cryptoApi.updateBot(bot.id, { mode })
    refresh()
  }

  async function runNow(bot) {
    await cryptoApi.runBot(bot.id)
    refresh()
  }

  async function remove(bot) {
    if (!confirm(`'${bot.name}' 봇을 삭제할까요?`)) return
    await cryptoApi.removeBot(bot.id)
    refresh()
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-amber-400" />
          <h2 className="text-base font-semibold">자동매매 봇</h2>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> 봇 만들기
        </Button>
      </div>

      {bots.length === 0 ? (
        <Empty>
          <div>아직 봇이 없습니다. 백테스트로 검증한 전략을 봇으로 만들어보세요.</div>
          <div className="text-xs">새 봇은 항상 안전한 모의(paper) 모드로 시작합니다.</div>
        </Empty>
      ) : (
        <div className="space-y-3">
          {bots.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              trades={trades.filter((t) => t.botId === bot.id)}
              onToggle={() => toggleEnabled(bot)}
              onSwitchMode={(m) => switchMode(bot, m)}
              onRun={() => runNow(bot)}
              onDelete={() => remove(bot)}
            />
          ))}
        </div>
      )}

      {/* 매매 기록 + 활동 로그 */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-medium text-slate-300">최근 매매</div>
          {trades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-6 text-center text-xs text-slate-500">
              매매 기록 없음
            </div>
          ) : (
            <div className="space-y-1">
              {trades.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <Pill tone={t.side === 'buy' ? 'red' : 'blue'}>{t.side === 'buy' ? '매수' : '매도'}</Pill>
                    <span className="text-slate-300">{t.symbol}</span>
                    <span className="text-slate-500">{t.mode === 'paper' ? '모의' : '실거래'}</span>
                  </span>
                  <span className="tnum text-slate-400">{fmtPrice(t.price, t.symbol.split('/')[1])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-slate-300">활동 로그</div>
          <div className="max-h-52 space-y-1 overflow-auto">
            {logs.slice(0, 30).map((l) => (
              <div key={l.id} className="flex items-start gap-2 px-1 py-1 text-xs text-slate-400">
                <span className="shrink-0 text-slate-600">{new Date(l.time).toLocaleTimeString('ko-KR')}</span>
                <span className={l.level === 'error' ? 'text-rose-400' : l.level === 'trade' ? 'text-emerald-400' : ''}>
                  {l.message}
                </span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 py-6 text-center text-xs text-slate-500">
                로그 없음
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateBot
          status={status}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            refresh()
          }}
        />
      )}
    </Card>
  )
}

function BotCard({ bot, trades, onToggle, onSwitchMode, onRun, onDelete }) {
  const realized = trades.filter((t) => t.side === 'sell').reduce((s, t) => s + (t.pnl || 0), 0)
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{bot.name}</span>
          <Pill tone="slate">{EXCHANGE_LABEL[bot.exchange]}</Pill>
          <Pill tone={bot.mode === 'live' ? 'red' : 'blue'}>{bot.mode === 'live' ? '실거래' : '모의'}</Pill>
          {bot.inPosition && <Pill tone="amber">보유중</Pill>}
          {bot.testnet && bot.mode === 'live' && <Pill tone="green">테스트넷</Pill>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{bot.enabled ? '가동중' : '정지'}</span>
          <Toggle on={bot.enabled} onClick={onToggle} />
        </div>
      </div>

      <div className="mt-1 text-xs text-slate-400">
        {bot.symbol} · {bot.timeframe} · {strategySummary(bot.strategy)} · 주문 {fmtNum(bot.orderSize)} {bot.quote}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {bot.mode === 'paper' && (
          <div className="rounded-lg bg-white/5 px-2 py-1.5">
            <div className="text-[10px] text-slate-400">모의 현금</div>
            <div className="tnum text-sm font-semibold">{fmtNum(Math.round(bot.paperCash))}</div>
          </div>
        )}
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="text-[10px] text-slate-400">실현손익</div>
          <div className={`tnum text-sm font-semibold ${tone(realized)}`}>
            {realized >= 0 ? '+' : ''}
            {fmtNum(Math.round(realized))}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="text-[10px] text-slate-400">포지션</div>
          <div className="tnum text-sm font-semibold">
            {bot.holding.base > 0 ? fmtNum(bot.holding.base, 4) : '-'}
          </div>
        </div>
      </div>

      {bot.lastReason && (
        <div className="mt-2 text-xs text-slate-500">
          최근 신호: <span className="text-slate-300">{bot.lastSignal}</span> · {bot.lastReason} · {timeAgo(bot.lastRun)}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={onRun} className="flex-1">
          <Power size={14} /> 지금 실행
        </Button>
        <Select
          value={bot.mode}
          onChange={(e) => onSwitchMode(e.target.value)}
          className="!w-auto"
        >
          <option value="paper">모의</option>
          <option value="live">실거래</option>
        </Select>
        <button
          onClick={onDelete}
          className="rounded-xl p-2 text-slate-500 hover:bg-white/10 hover:text-rose-400"
          title="삭제"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

function CreateBot({ status, onClose, onCreated }) {
  const [exchange, setExchange] = useState('binance')
  const [symbol, setSymbol] = useState('BTC/USDT')
  const [timeframe, setTimeframe] = useState('1h')
  const [strategy, setStrategy] = useState({ type: 'rsi', period: 14, oversold: 30, overbought: 70 })
  const [orderSize, setOrderSize] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSymbol(MARKETS[exchange][0])
  }, [exchange])

  const quote = symbol.split('/')[1]
  const limit =
    quote === 'KRW' ? status?.limits?.maxOrderKrw : status?.limits?.maxOrderUsdt

  async function create() {
    setBusy(true)
    try {
      await cryptoApi.createBot({
        name: name || undefined,
        exchange,
        symbol,
        timeframe,
        strategy,
        orderSize: orderSize ? Number(orderSize) : undefined,
        mode: 'paper',
      })
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <Card
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-b-none bg-[#0e1320] p-5 sm:rounded-b-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">봇 만들기</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="봇 이름 (선택)">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 비트코인 RSI 봇" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="거래소">
              <Select value={exchange} onChange={(e) => setExchange(e.target.value)}>
                <option value="binance">바이낸스</option>
                <option value="upbit">업비트</option>
              </Select>
            </Field>
            <Field label="종목">
              <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {MARKETS[exchange].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="봉 주기">
              <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                {TIMEFRAMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`1회 주문액 (${quote})`} hint={limit ? `최대 ${fmtNum(limit)} ${quote}` : undefined}>
              <Input
                type="number"
                value={orderSize}
                onChange={(e) => setOrderSize(e.target.value)}
                placeholder="기본값"
              />
            </Field>
          </div>
          <StrategyEditor value={strategy} onChange={setStrategy} />

          <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>새 봇은 <b>모의(paper)</b> 모드로 생성됩니다. 충분히 검증한 뒤 카드에서 실거래로 전환하세요.</span>
          </div>

          <Button variant="primary" className="w-full" onClick={create} disabled={busy}>
            {busy ? '생성 중…' : '봇 생성'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
