'use strict';

const { send, methodNotAllowed } = require('../../lib/server/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return send(res, 503, { ok: false, stage: 'environment', error: 'Supabase public configuration missing' });

  const redirectTo = 'https://studty-tools-main-2hb9f549a-lunia-ai.vercel.app/';
  try {
    const url = new URL('/auth/v1/authorize', supabaseUrl);
    url.searchParams.set('provider', 'google');
    url.searchParams.set('redirect_to', redirectTo);
    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: anonKey },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    const location = response.headers.get('location');
    let payload = null;
    if (!location && response.status >= 400) {
      const raw = await response.text();
      try { payload = JSON.parse(raw); } catch { payload = raw.slice(0, 300); }
    }
    let redirectHost = null;
    if (location) {
      try { redirectHost = new URL(location).hostname; } catch {}
    }
    return send(res, 200, {
      ok: response.status >= 300 && response.status < 400 && redirectHost === 'accounts.google.com',
      supabaseStatus: response.status,
      redirectHost,
      error: payload?.message || payload?.msg || (typeof payload === 'string' ? payload : null),
      redirectTo,
    });
  } catch (error) {
    return send(res, 502, { ok: false, error: error.message || 'Supabase Auth request failed' });
  }
};
