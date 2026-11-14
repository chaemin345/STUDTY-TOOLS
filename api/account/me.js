'use strict';

const { send, methodNotAllowed, handleError } = require('../../lib/server/http');
const { requireUser, dbRequest } = require('../../lib/server/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const user = await requireUser(req);
    const masterEmail = String(process.env.MASTER_GOOGLE_EMAIL || '').trim().toLowerCase();
    const googleIdentity = Array.isArray(user.identities) && user.identities.some(identity => identity.provider === 'google');
    const verified = !!user.email_confirmed_at;
    const isMaster = !!masterEmail && googleIdentity && verified && String(user.email || '').toLowerCase() === masterEmail;
    const rows = await dbRequest(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=plan,status,starts_at,expires_at&limit=1`);
    const subscription = Array.isArray(rows) ? rows[0] || null : null;
    const active = !!subscription && subscription.status === 'active' && new Date(subscription.expires_at).getTime() > Date.now();
    return send(res, 200, { user: { id: user.id, email: user.email || null }, role: isMaster ? 'master' : 'user', subscription: active ? subscription : null, plan: isMaster ? 'master' : active ? (String(subscription.plan).startsWith('max_') ? 'pro_max' : 'pro') : 'free' });
  } catch (error) { return handleError(res, error); }
};
