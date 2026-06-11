import { useEffect, useMemo, useState } from 'react'
import { Coins, KeyRound, Lock, RefreshCw, X } from 'lucide-react'
import { upbitApi } from '../api.js'
import { Button, Card, Empty, Field, Input, Pill } from '../components/ui.jsx'
import { fmtNum, fmtPct, fmtPrice, tone } from '../lib/format.js'
import {
  clearCreds,
  getBalance,
  hasStoredCreds,
  isUnlocked,
  lock,
  saveCreds,
  testConnection,
  unlock,
} from '../lib/upbit.js'

export default function UpbitAssets() {
  const [stored, setStored] = useState(hasStoredCreds())
  const [unlocked, setUnlocked] = useState(isUnlocked())
  const [accounts, setAccounts] = useState([])
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showConnect, setShowConnect] = useState(false)

  const syncState = () => {
    setStored(hasStoredCreds())
    setUnlocked(isUnlocked())
  }

  async function refresh() {
    if (!isUnlocked()) return
    setLoading(true)
    setError(null)
    try {
      const accts = await getBalance()
      const held = (Array.isArray(accts) ? accts : []).filter(
        (a) => Number(a.balance) + Number(a.locked) > 0,
      )
      const markets = held.filter((a) => a.currency !== 'KRW').map((a) => `KRW-${a.currency}`)
      const px = markets.length ? await upbitApi.prices(markets) : {}
      setAccounts(held)
      setPrices(px)
    } catch (e) {
      setError(e?.response?.data?.error || e.message || '조회 실패')
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (unlocked) refresh()
    else {
      setAccounts([])
      setPrices({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked])

  const rows = useMemo(
    () =>
      accounts
        .map((a) => {
          const qty = Number(a.balance) + Number(a.locked)
          const isKRW = a.currency === 'KRW'
          const price = isKRW ? 1 : (prices[`KRW-${a.currency}`] ?? null)
          const value = price != null ? qty * price : null
          const avg = Number(a.avg_buy_price) || 0
          const cost = !isKRW && avg > 0 ? avg * qty : null
          const pnl = value != null && cost != null ? value - cost : null
          const pnlPct = pnl != null && cost ? (pnl / cost) * 100 : null
          return { currency: a.currency, qty, isKRW, price, value, avg, pnl, pnlPct }
        })
        .sort((a, b) => (b.value ?? -1) - (a.value ?? -1)),
    [accounts, prices],
  )

  const totalKRW = rows.reduce((s, r) => s + (r.value || 0), 0)
  const connectLabel = !stored ? '업비트 연동' : unlocked ? '연결됨' : '잠김'

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <Coins size={14} /> 업비트 총 평가금액 (원화)
            </div>
            <div className="tnum mt-1 text-3xl font-bold">{fmtNum(Math.round(totalKRW))}원</div>
            <div className="mt-1 text-xs text-slate-500">
              {unlocked
                ? '내 키로 직접 조회 · 시세 실시간 환산'
                : '연동하면 내 업비트 잔고가 여기에 표시됩니다'}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant={stored ? 'ghost' : 'primary'} onClick={() => setShowConnect(true)}>
              {stored && !unlocked ? <Lock size={14} /> : <KeyRound size={14} />} {connectLabel}
            </Button>
            {unlocked && (
              <Button variant="ghost" onClick={refresh} title="새로고침">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4">
          <div className="text-sm text-rose-300">{error}</div>
        </Card>
      )}

      {!unlocked ? (
        <Card className="p-4">
          <Empty>
            <Coins size={28} className="text-slate-600" />
            <div>
              {stored
                ? '잠겨 있습니다. 암호를 입력해 잠금을 해제하세요.'
                : '아직 업비트를 연동하지 않았습니다.'}
            </div>
            <Button variant="primary" onClick={() => setShowConnect(true)}>
              {stored ? '잠금 해제' : '업비트 연동하기'}
            </Button>
            <div className="max-w-sm text-[11px] leading-relaxed text-slate-500">
              🔒 <b>읽기전용(자산조회) 키</b>만 등록하세요. 주문·출금 권한 키는 넣지 마세요. 키는
              암호로 암호화돼 <b>이 브라우저에만</b> 저장되고, 시크릿은 서버로 전송되지 않습니다.
            </div>
          </Empty>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-4">
          <Empty>{loading ? '불러오는 중…' : '보유 자산이 없습니다.'}</Empty>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.currency} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.currency}</span>
                    {r.isKRW && <Pill tone="blue">원화</Pill>}
                  </div>
                  <div className="tnum mt-1 text-xs text-slate-500">
                    {fmtNum(r.qty, r.qty % 1 ? 4 : 0)} {r.currency}
                    {!r.isKRW && r.avg > 0 && <> · 평단 {fmtPrice(r.avg, 'KRW')}</>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum font-semibold">
                    {r.value != null ? fmtPrice(r.value, 'KRW') : '시세 없음'}
                  </div>
                  {!r.isKRW && r.price != null && (
                    <div className="tnum mt-0.5 text-xs text-slate-500">
                      현재가 {fmtPrice(r.price, 'KRW')}
                    </div>
                  )}
                  {r.pnlPct != null && (
                    <div className={`tnum mt-0.5 text-xs font-medium ${tone(r.pnl)}`}>
                      {fmtPct(r.pnlPct)}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showConnect && <UpbitConnect onClose={() => setShowConnect(false)} onChange={syncState} />}
    </div>
  )
}

function UpbitConnect({ onClose, onChange }) {
  const stored = hasStoredCreds()
  const [unlocked, setUnlocked] = useState(isUnlocked())
  // setup: 저장된 키 없음 / unlock: 저장됨+잠김 / ready: 저장됨+해제됨
  const mode = !stored ? 'setup' : unlocked ? 'ready' : 'unlock'

  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [unlockPass, setUnlockPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function testAndSave() {
    if (!accessKey.trim() || !secretKey.trim()) {
      setMsg({ ok: false, text: 'Access Key와 Secret Key를 모두 입력하세요' })
      return
    }
    if (pass1.length < 4) {
      setMsg({ ok: false, text: '잠금 암호를 4자 이상 입력하세요' })
      return
    }
    if (pass1 !== pass2) {
      setMsg({ ok: false, text: '잠금 암호가 서로 다릅니다' })
      return
    }
    setBusy(true)
    setMsg(null)
    const creds = { accessKey: accessKey.trim(), secretKey: secretKey.trim() }
    try {
      await testConnection(creds)
      await saveCreds(creds, pass1)
      setUnlocked(true)
      setMsg({ ok: true, text: '연결 성공! 키를 암호로 잠가 저장했습니다.' })
      onChange?.()
      setTimeout(onClose, 800)
    } catch (e) {
      setMsg({ ok: false, text: e?.response?.data?.error || e.message || '연결 실패' })
    } finally {
      setBusy(false)
    }
  }

  async function doUnlock() {
    if (!unlockPass) {
      setMsg({ ok: false, text: '암호를 입력하세요' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await unlock(unlockPass)
      setUnlocked(true)
      setMsg({ ok: true, text: '잠금 해제됨. 잔고를 불러옵니다.' })
      onChange?.()
      setTimeout(onClose, 700)
    } catch (e) {
      setMsg({ ok: false, text: e.message || '잠금 해제 실패' })
    } finally {
      setBusy(false)
    }
  }

  function doLock() {
    lock()
    setUnlocked(false)
    setUnlockPass('')
    setMsg({ ok: true, text: '잠갔습니다. 다시 보려면 암호를 입력하세요.' })
    onChange?.()
  }

  function unlink() {
    clearCreds()
    setUnlocked(false)
    onChange?.()
    onClose()
  }

  const title = mode === 'setup' ? '업비트 연동' : mode === 'unlock' ? '업비트 잠금 해제' : '업비트 연동됨'

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <Card
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-b-none bg-[#0e1320] p-5 sm:rounded-b-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          {mode === 'setup' && (
            <>
              <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
                ⚠️ <b>읽기전용 키</b>만 쓰세요. 업비트 키 발급 시 <b>자산조회만 ✅</b>, 주문·출금은
                반드시 ❌. 허용 IP는 비워두고 발급하세요(서버 IP 고정 아님). 읽기전용이라 키가 새도
                잔고만 보일 뿐 거래·출금은 불가능합니다.
              </div>
              <Field label="Access Key">
                <Input
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="업비트 발급 Access Key"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Secret Key">
                <Input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="업비트 발급 Secret Key"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="잠금 암호" hint="키를 풀 때 쓰는 암호. 복구 불가하니 잊지 마세요.">
                <Input
                  type="password"
                  value={pass1}
                  onChange={(e) => setPass1(e.target.value)}
                  placeholder="4자 이상"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="잠금 암호 확인">
                <Input
                  type="password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  placeholder="한 번 더"
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}

          {mode === 'unlock' && (
            <>
              <p className="text-xs text-slate-400">
                저장된 업비트 키가 암호로 잠겨 있습니다. 암호를 입력해 잠금을 해제하세요.
              </p>
              <Field label="잠금 암호">
                <Input
                  type="password"
                  value={unlockPass}
                  onChange={(e) => setUnlockPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doUnlock()}
                  placeholder="저장할 때 정한 암호"
                  autoComplete="off"
                  autoFocus
                />
              </Field>
            </>
          )}

          {mode === 'ready' && (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
              ✅ 연결됨 · 잠금 해제 상태
              <p className="mt-1 text-[11px] text-emerald-300/70">
                새로고침하면 다시 암호를 입력해야 합니다.
              </p>
            </div>
          )}

          {msg && (
            <div
              className={`rounded-lg px-3 py-2 text-xs ${
                msg.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {msg.text}
            </div>
          )}

          {mode === 'setup' && (
            <Button variant="primary" className="w-full" disabled={busy} onClick={testAndSave}>
              {busy ? '연결 확인 중…' : '연결 테스트 후 저장'}
            </Button>
          )}
          {mode === 'unlock' && (
            <>
              <Button variant="primary" className="w-full" disabled={busy} onClick={doUnlock}>
                {busy ? '여는 중…' : '잠금 해제'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={unlink}>
                연동 해제 (저장된 키 삭제)
              </Button>
            </>
          )}
          {mode === 'ready' && (
            <>
              <Button variant="default" className="w-full" onClick={doLock}>
                잠그기
              </Button>
              <Button variant="ghost" className="w-full" onClick={unlink}>
                연동 해제 (저장된 키 삭제)
              </Button>
            </>
          )}

          <p className="text-[11px] leading-relaxed text-slate-500">
            🔒 키는 <b>암호로 암호화되어 이 브라우저에만</b> 저장됩니다(서버 저장 안 함). 공용 PC에서는
            사용하지 마세요. 키는{' '}
            <a
              href="https://upbit.com/mypage/open_api_management"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-300 underline"
            >
              업비트 Open API 관리
            </a>{' '}
            에서 발급합니다.
          </p>
        </div>
      </Card>
    </div>
  )
}
