// 키움증권 REST API 프록시 (무상태)
// - 서버는 사용자의 App Key/Secret/토큰을 저장하지 않고 키움 호출만 중계한다.
// - 보안: 키/토큰/authorization 헤더를 로그에 절대 남기지 않는다.
//   (yahoo.js 의 fetchJson 은 URL·에러를 console.warn 으로 찍으므로 그걸 재사용하지 않고 분리)
//
// 도메인: 실전 https://api.kiwoom.com / 모의 https://mockapi.kiwoom.com
// 토큰  : POST /oauth2/token  body {grant_type:"client_credentials", appkey, secretkey}
//         → {token, token_type:"bearer", expires_dt:"YYYYMMDDHHmmss"}
// 계좌  : POST /api/dostk/acnt  헤더 {authorization:"Bearer <token>", api-id:"kt00018"}
//         페이지네이션 헤더 cont-yn / next-key

const HOSTS = {
  real: 'https://api.kiwoom.com',
  mock: 'https://mockapi.kiwoom.com',
}

const hostFor = (mock) => (mock ? HOSTS.mock : HOSTS.real)

// 키움 응답을 민감정보 없는 안전한 에러로 변환한다. (키/토큰은 절대 포함하지 않음)
function sanitizeError(status, body) {
  if (status === 401 || status === 403)
    return new Error('키움 인증 실패: App Key/Secret 또는 토큰을 확인하세요')
  if (status === 429) return new Error('키움 요청 한도 초과: 잠시 후 다시 시도하세요')
  const msg =
    body && typeof body === 'object' ? body.return_msg || body.msg || body.message : null
  return new Error(msg ? `키움 오류: ${msg}` : `키움 요청 실패 (HTTP ${status})`)
}

// 접근토큰 발급. secret 은 이 호출 1회에서만 네트워크에 흐른다.
export async function issueToken({ appkey, secretkey, mock = false }) {
  if (!appkey || !secretkey) throw new Error('appkey/secretkey 가 필요합니다')
  let r
  try {
    r = await fetch(hostFor(mock) + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ grant_type: 'client_credentials', appkey, secretkey }),
    })
  } catch (e) {
    // 네트워크 오류 — 키가 로그/메시지에 새지 않도록 원인 코드만 노출
    throw new Error(`키움 연결 실패: ${e?.cause?.code || e.message}`)
  }
  let body = null
  try {
    body = await r.json()
  } catch {
    /* non-JSON 응답 */
  }
  if (!r.ok || !body?.token) throw sanitizeError(r.status, body)
  return {
    token: body.token,
    tokenType: body.token_type || 'bearer',
    expiresDt: body.expires_dt || null, // YYYYMMDDHHmmss
  }
}

// 범용 TR 호출 (api-id 헤더로 TR 구분). 응답 본문 + 페이지네이션 헤더를 반환.
async function requestTr({ token, mock = false, path, apiId, body = {}, contYn, nextKey }) {
  if (!token) throw new Error('token 이 필요합니다')
  const headers = {
    'Content-Type': 'application/json;charset=UTF-8',
    authorization: `Bearer ${token}`,
    'api-id': apiId,
  }
  if (contYn) headers['cont-yn'] = contYn
  if (nextKey) headers['next-key'] = nextKey

  let r
  try {
    r = await fetch(hostFor(mock) + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new Error(`키움 연결 실패: ${e?.cause?.code || e.message}`)
  }
  let data = null
  try {
    data = await r.json()
  } catch {
    /* non-JSON 응답 */
  }
  if (!r.ok) throw sanitizeError(r.status, data)
  // 키움은 HTTP 200 이어도 return_code 로 오류를 표현할 수 있다 (0 = 정상).
  if (data && typeof data === 'object' && data.return_code != null && data.return_code !== 0)
    throw new Error(`키움 오류: ${data.return_msg || 'return_code ' + data.return_code}`)
  return {
    data,
    contYn: r.headers.get('cont-yn') || null,
    nextKey: r.headers.get('next-key') || null,
  }
}

// 계좌평가잔고내역 (kt00018) — 보유종목·평가손익·예수금.
// ⚠️ kt00018 의 정확한 요청 바디/응답 필드명은 모의계좌 실제 응답으로 확정한다(가짜 필드명 금지).
//    그래서 지금은 원본(raw)을 그대로 반환한다. 필드 확정 후 normalizeBalance 를 채워 정규화한다.
export async function fetchBalanceRaw({ token, mock = false, body, contYn, nextKey }) {
  return requestTr({
    token,
    mock,
    path: '/api/dostk/acnt',
    apiId: 'kt00018',
    body: body || {},
    contYn,
    nextKey,
  })
}
