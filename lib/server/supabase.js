'use strict';

const { HttpError } = require('./http');

function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new HttpError(503, '계정·데이터베이스 설정이 아직 완료되지 않았습니다.');
  return { url: url.replace(/\/$/, ''), anonKey, serviceKey };
}

async function requireUser(req) {
  const { url, anonKey } = getSupabaseEnv();
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, '로그인이 필요합니다.');
  let response;
  try {
    response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${match[1]}` }, signal: AbortSignal.timeout(8000) });
  } catch { throw new HttpError(503, '로그인 서버에 연결할 수 없습니다.'); }
  if (!response.ok) throw new HttpError(401, '로그인 세션이 만료되었습니다. 다시 로그인하세요.');
  const user = await response.json();
  if (!user?.id) throw new HttpError(401, '사용자 정보를 확인할 수 없습니다.');
  return user;
}

async function dbRequest(path, options = {}) {
  const { url, serviceKey } = getSupabaseEnv();
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(options.prefer ? { Prefer: options.prefer } : {}), ...(options.headers || {}) };
  let response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: AbortSignal.timeout(options.timeoutMs || 10000) });
  } catch { throw new HttpError(503, '데이터베이스에 연결할 수 없습니다.'); }
  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : '데이터베이스 요청이 실패했습니다.';
    throw new HttpError(response.status >= 500 ? 503 : 400, message);
  }
  return payload;
}

async function requirePro(user) {
  const masterEmail = String(process.env.MASTER_GOOGLE_EMAIL || '').trim().toLowerCase();
  const isGoogle = Array.isArray(user.identities) && user.identities.some(identity => identity.provider === 'google');
  if (masterEmail && isGoogle && user.email_confirmed_at && String(user.email || '').toLowerCase() === masterEmail) return { plan: 'master', status: 'active', expires_at: null };
  const uid = encodeURIComponent(user.id);
  const rows = await dbRequest(`subscriptions?user_id=eq.${uid}&select=plan,status,starts_at,expires_at&limit=1`);
  const subscription = Array.isArray(rows) ? rows[0] || null : null;
  const active = subscription && subscription.status === 'active' && new Date(subscription.expires_at).getTime() > Date.now();
  if (!active) throw new HttpError(403, '이 기능은 Pro 플랜에서 사용할 수 있습니다.');
  return subscription;
}

module.exports = { getSupabaseEnv, requireUser, dbRequest, requirePro };
