'use strict';

const { send, methodNotAllowed, handleError } = require('../../lib/server/http');
const { requireUser, dbRequest } = require('../../lib/server/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const user = await requireUser(req);
    const rows = await dbRequest(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=plan,status,starts_at,expires_at&limit=1`);
    const subscription = Array.isArray(rows) ? rows[0] || null : null;
    const active = !!subscription && subscription.status === 'active' && new Date(subscription.expires_at).getTime() > Date.now();
    return send(res, 200, { user: { id: user.id, email: user.email || null }, subscription: active ? subscription : null, plan: active ? 'pro' : 'free' });
  } catch (error) { return handleError(res, error); }
};