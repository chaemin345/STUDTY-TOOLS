'use strict';

const { send, methodNotAllowed, handleError } = require('../../lib/server/http');
const { requireUser, dbRequest, isMasterGoogleUser } = require('../../lib/server/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const user = await requireUser(req);
    const isMaster = isMasterGoogleUser(user);
    const publicUser = { id: user.id, email: user.email || null };
    if (isMaster) {
      return send(res, 200, { user: publicUser, role: 'master', subscription: null, plan: 'master' });
    }
    const rows = await dbRequest(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=plan,status,starts_at,expires_at&limit=1`);
    const subscription = Array.isArray(rows) ? rows[0] || null : null;
    const active = !!subscription && subscription.status === 'active' && new Date(subscription.expires_at).getTime() > Date.now();
    return send(res, 200, { user: publicUser, role: 'user', subscription: active ? subscription : null, plan: active ? (String(subscription.plan).startsWith('max_') ? 'pro_max' : 'pro') : 'free' });
  } catch (error) { return handleError(res, error); }
};
