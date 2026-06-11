// 키움 연동 — 키를 이 브라우저에 "암호로 잠가서" 저장한다. (무상태 프록시 + 암호 잠금)
// · localStorage 에는 암호화된 덩어리만 둔다. 평문 키는 절대 디스크에 안 남는다.
// · 잠금 해제(암호 입력) 시에만 키가 메모리로 풀리고, 토큰도 메모리에만 둔다.
// · 새로고침하면 메모리가 비므로 암호를 다시 입력해야 한다. (= 기기 도난·스누핑 방어)
// 서버는 키를 저장하지 않으므로 보관·복호화·토큰 캐시는 전부 클라가 책임진다.

import { kiwoomApi } from '../api.js'

const BLOB_KEY = 'kiwoom.creds.v2' // { v, salt, iv, ct } — 암호화된 자격증명
const LEGACY_KEYS = ['kiwoom.creds.v1', 'kiwoom.token.v1'] // 과거 평문 흔적 제거용

// 과거 평문 저장 흔적이 있으면 즉시 지운다. (평문 키를 디스크에 남기지 않음)
for (const k of LEGACY_KEYS) {
  try {
    if (localStorage.getItem(k)) localStorage.removeItem(k)
  } catch {}
}

// ── 세션 메모리(디스크 저장 안 함) ──
let memCreds = null // { appkey, secretkey, mock } — 잠금 해제 시에만 채워짐
let memToken = null // { token, expiresAt(ms), mock }

// ── WebCrypto 헬퍼 (PBKDF2 → AES-GCM-256) ──
const enc = new TextEncoder()
const dec = new TextDecoder()

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function subtle() {
  // crypto.subtle 은 보안 컨텍스트(HTTPS/localhost)에서만 제공된다.
  if (!globalThis.crypto?.subtle) {
    throw new Error('이 브라우저/주소에서는 암호화를 쓸 수 없습니다 (HTTPS 또는 localhost 필요).')
  }
  return globalThis.crypto.subtle
}

async function deriveKey(passphrase, salt) {
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptCreds(creds, passphrase) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(creds)),
  )
  return { v: 2, salt: bufToB64(salt), iv: bufToB64(iv), ct: bufToB64(ct) }
}

async function decryptCreds(blob, passphrase) {
  const key = await deriveKey(passphrase, b64ToBuf(blob.salt))
  const pt = await subtle().decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(blob.iv) },
    key,
    b64ToBuf(blob.ct),
  )
  return JSON.parse(dec.decode(pt))
}

// ── 상태 조회 ──
export function hasStoredCreds() {
  try {
    return !!localStorage.getItem(BLOB_KEY)
  } catch {
    return false
  }
}
export function isUnlocked() {
  return !!memCreds
}
// 잠금 해제된 동안만 모드(mock/실전)를 알 수 있다.
export function currentMock() {
  return memCreds?.mock ?? null
}

// ── 저장 / 잠금 해제 / 잠금 / 삭제 ──
// 새 키를 암호로 잠가서 저장하고, 이번 세션은 바로 잠금 해제 상태로 둔다.
export async function saveCreds(creds, passphrase) {
  if (!passphrase) throw new Error('잠금 암호를 입력하세요.')
  const blob = await encryptCreds(creds, passphrase)
  localStorage.setItem(BLOB_KEY, JSON.stringify(blob))
  memCreds = creds
  memToken = null
}

// 저장된 키를 암호로 풀어 메모리에 올린다. 암호가 틀리면 복호화가 실패한다.
export async function unlock(passphrase) {
  const raw = localStorage.getItem(BLOB_KEY)
  if (!raw) throw new Error('저장된 키움 키가 없습니다.')
  let blob
  try {
    blob = JSON.parse(raw)
  } catch {
    throw new Error('저장된 키 형식이 손상되었습니다. 연동을 해제하고 다시 등록하세요.')
  }
  try {
    memCreds = await decryptCreds(blob, passphrase)
  } catch {
    memCreds = null
    throw new Error('암호가 틀렸습니다.') // AES-GCM 인증 실패 = 암호 불일치(또는 손상)
  }
  memToken = null
  return true
}

export function lock() {
  memCreds = null
  memToken = null
}

export function clearCreds() {
  try {
    localStorage.removeItem(BLOB_KEY)
  } catch {}
  lock()
}

// ── 토큰 ──
// "YYYYMMDDHHmmss" → epoch ms. 타임존이 불확실하므로 로컬타임으로 해석하고,
// 파싱 실패 시 발급 후 12시간으로 보수적으로 잡는다. (만료 임박·오류 시 어차피 재발급)
function parseExpiry(expiresDt) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(expiresDt || ''))
  if (!m) return Date.now() + 12 * 3600 * 1000
  const [, y, mo, d, h, mi, s] = m.map(Number)
  const t = new Date(y, mo - 1, d, h, mi, s).getTime()
  return Number.isFinite(t) ? t : Date.now() + 12 * 3600 * 1000
}

let inflight = null // 동시 호출 시 토큰 발급을 한 번만 (race 방지)

// 유효한 토큰을 돌려준다. 메모리 캐시가 살아있으면 재사용, 아니면 재발급.
export async function getValidToken() {
  if (!memCreds) throw new Error('잠금 해제가 필요합니다. 암호를 입력해 잠금을 해제하세요.')
  if (memToken?.token && memToken.mock === memCreds.mock && memToken.expiresAt - Date.now() > 60_000) {
    return memToken.token
  }
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await kiwoomApi.token({
        appkey: memCreds.appkey,
        secretkey: memCreds.secretkey,
        mock: memCreds.mock,
      })
      memToken = { token: res.token, expiresAt: parseExpiry(res.expiresDt), mock: memCreds.mock }
      return res.token
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// 저장 전 입력값으로 연결(토큰 발급)만 테스트한다. (저장·메모리 반영 안 함)
export async function testConnection(creds) {
  const res = await kiwoomApi.token({
    appkey: creds.appkey,
    secretkey: creds.secretkey,
    mock: creds.mock,
  })
  return !!res?.token
}

// 계좌 잔고 조회. 현재는 키움 원본(raw)을 반환한다.
// (kt00018 응답 필드 확정 후, 여기서 holdings 형태로 정규화할 예정 — 가짜 필드명 금지)
export async function getBalanceRaw() {
  if (!memCreds) throw new Error('잠금 해제가 필요합니다. 암호를 입력해 잠금을 해제하세요.')
  const token = await getValidToken()
  try {
    return await kiwoomApi.balance({ token, mock: memCreds.mock })
  } catch (e) {
    // 토큰 만료/무효 추정 → 강제 재발급 후 1회 재시도
    memToken = null
    const token2 = await getValidToken()
    return await kiwoomApi.balance({ token: token2, mock: memCreds.mock })
  }
}
