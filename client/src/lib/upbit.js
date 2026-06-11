// 업비트 연동 — 키를 이 브라우저에 "암호로 잠가서" 저장한다. (무상태 프록시 + 암호 잠금)
// · localStorage 에는 암호화된 덩어리만 둔다. 평문 키는 절대 디스크에 안 남는다.
// · 인증이 필요한 호출은 시크릿으로 "이 브라우저에서 직접 JWT 서명" 한다.
//   → 시크릿은 서버로 전송되지 않는다. (서버는 access_key 와 서명만 봄)
// · 새로고침하면 메모리가 비므로 암호를 다시 입력해야 한다. (= 기기 도난·스누핑 방어)
// 서버는 키를 저장하지 않으므로 보관·복호화·서명은 전부 클라가 책임진다.

import { upbitApi } from '../api.js'

const BLOB_KEY = 'upbit.creds.v1' // { v, salt, iv, ct } — 암호화된 자격증명

// ── 세션 메모리(디스크 저장 안 함) ──
let memCreds = null // { accessKey, secretKey } — 잠금 해제 시에만 채워짐

// ── WebCrypto 헬퍼 (PBKDF2 → AES-GCM-256) ──
const enc = new TextEncoder()
const dec = new TextDecoder()

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}
// base64url (JWT 용) — '+/' 치환 및 '=' 패딩 제거
function b64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(creds)))
  return { v: 1, salt: bufToB64(salt), iv: bufToB64(iv), ct: bufToB64(ct) }
}

async function decryptCreds(blob, passphrase) {
  const key = await deriveKey(passphrase, b64ToBuf(blob.salt))
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: b64ToBuf(blob.iv) }, key, b64ToBuf(blob.ct))
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

// ── 저장 / 잠금 해제 / 잠금 / 삭제 ──
// 새 키를 암호로 잠가서 저장하고, 이번 세션은 바로 잠금 해제 상태로 둔다.
export async function saveCreds(creds, passphrase) {
  if (!passphrase) throw new Error('잠금 암호를 입력하세요.')
  const blob = await encryptCreds(creds, passphrase)
  localStorage.setItem(BLOB_KEY, JSON.stringify(blob))
  memCreds = creds
}

// 저장된 키를 암호로 풀어 메모리에 올린다. 암호가 틀리면 복호화가 실패한다.
export async function unlock(passphrase) {
  const raw = localStorage.getItem(BLOB_KEY)
  if (!raw) throw new Error('저장된 업비트 키가 없습니다.')
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
  return true
}

export function lock() {
  memCreds = null
}

export function clearCreds() {
  try {
    localStorage.removeItem(BLOB_KEY)
  } catch {}
  lock()
}

// ── JWT 서명 (브라우저에서, 시크릿은 전송하지 않음) ──
// 잔고는 파라미터가 없으므로 payload = { access_key, nonce } 로 충분하다.
async function signAccountsJwt(creds) {
  const payload = { access_key: creds.accessKey, nonce: globalThis.crypto.randomUUID() }
  const input =
    b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))) +
    '.' +
    b64url(enc.encode(JSON.stringify(payload)))
  const key = await subtle().importKey(
    'raw',
    enc.encode(creds.secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await subtle().sign('HMAC', key, enc.encode(input))
  return input + '.' + b64url(sig)
}

// 저장 전 입력값으로 연결(잔고 조회)만 테스트한다. (저장·메모리 반영 안 함)
export async function testConnection(creds) {
  const jwt = await signAccountsJwt(creds)
  const accts = await upbitApi.accounts({ jwt })
  return Array.isArray(accts)
}

// 잔고 조회. 매 호출마다 새 nonce 로 서명한다.
export async function getBalance() {
  if (!memCreds) throw new Error('잠금 해제가 필요합니다. 암호를 입력해 잠금을 해제하세요.')
  const jwt = await signAccountsJwt(memCreds)
  return upbitApi.accounts({ jwt })
}
