// 업비트 REST API 프록시 (무상태)
// - 서버는 사용자의 Access/Secret 키를 저장하지 않는다.
// - 인증이 필요한 호출은 "클라이언트가 시크릿으로 직접 서명한 JWT" 만 받아 중계한다.
//   → 시크릿은 사용자의 브라우저를 절대 벗어나지 않는다. (서버는 access_key 와 서명만 봄)
// - 보안: 토큰/응답을 로그에 남기지 않는다.
//
// 인증: Authorization: Bearer <JWT>
//   JWT payload = { access_key, nonce[, query_hash, query_hash_alg] }, HS256(secret) 서명
//   잔고(파라미터 없음) → payload = { access_key, nonce } 로 충분
// 도메인: https://api.upbit.com

const HOST = 'https://api.upbit.com'

// 업비트 응답을 민감정보 없는 안전한 에러로 변환한다.
function sanitizeError(status, body) {
  if (status === 401)
    return new Error('업비트 인증 실패: 키 또는 허용 IP 설정을 확인하세요 (읽기전용 키 권장)')
  if (status === 429) return new Error('업비트 요청 한도 초과: 잠시 후 다시 시도하세요')
  const msg = body && typeof body === 'object' ? body.error?.message || body.message : null
  return new Error(msg ? `업비트 오류: ${msg}` : `업비트 요청 실패 (HTTP ${status})`)
}

// 전체 계좌(잔고) 조회. 클라가 서명한 Bearer JWT 로 /v1/accounts 를 중계한다.
// 응답: [{ currency, balance, locked, avg_buy_price, avg_buy_price_modified, unit_currency }]
export async function fetchAccounts(jwt) {
  if (!jwt) throw new Error('인증 토큰이 필요합니다')
  let r
  try {
    r = await fetch(HOST + '/v1/accounts', {
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
    })
  } catch (e) {
    throw new Error(`업비트 연결 실패: ${e?.cause?.code || e.message}`)
  }
  let body = null
  try {
    body = await r.json()
  } catch {
    /* non-JSON 응답 */
  }
  if (!r.ok) throw sanitizeError(r.status, body)
  return body
}

// 거래 가능한 전체 마켓 코드 집합 (공개). 잘못된 코드가 섞이면 ticker 가 전체를 거부하므로,
// 유효한 코드만 추리는 데 쓴다. 자주 바뀌지 않는 공개 데이터라 프로세스 캐시.
let marketsCache = null
async function validMarkets() {
  if (marketsCache) return marketsCache
  let r
  try {
    r = await fetch(`${HOST}/v1/market/all`, { headers: { Accept: 'application/json' } })
  } catch (e) {
    throw new Error(`업비트 연결 실패: ${e?.cause?.code || e.message}`)
  }
  let body = null
  try {
    body = await r.json()
  } catch {
    /* non-JSON 응답 */
  }
  if (!r.ok) throw sanitizeError(r.status, body)
  marketsCache = new Set((Array.isArray(body) ? body : []).map((m) => m.market))
  return marketsCache
}

// 공개 시세 — KRW 환산용. 인증 불필요.
// markets: ['KRW-BTC', 'KRW-ETH', ...] → { 'KRW-BTC': 현재가, ... }
// KRW 마켓이 없는 코인(거래중지/타마켓 전용)은 결과에서 빠진다 → 호출 측에서 '잔고만 표시'.
export async function fetchPrices(markets) {
  if (!markets?.length) return {}
  const valid = await validMarkets()
  const ask = [...new Set(markets)].filter((m) => valid.has(m))
  if (!ask.length) return {}
  let r
  try {
    r = await fetch(`${HOST}/v1/ticker?markets=${encodeURIComponent(ask.join(','))}`, {
      headers: { Accept: 'application/json' },
    })
  } catch (e) {
    throw new Error(`업비트 연결 실패: ${e?.cause?.code || e.message}`)
  }
  let body = null
  try {
    body = await r.json()
  } catch {
    /* non-JSON 응답 */
  }
  if (!r.ok) throw sanitizeError(r.status, body)
  const out = {}
  for (const t of Array.isArray(body) ? body : []) out[t.market] = t.trade_price
  return out
}
