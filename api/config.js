'use strict';

const { send, methodNotAllowed } = require('../lib/server/http');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasSupabase = !!(process.env.SUPABASE_URL && publicKey && serviceKey);
  const hasEncryption = !!process.env.INTEGRATION_ENCRYPTION_KEY;
  return send(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: publicKey || null,
    integrationsReady: hasSupabase && hasEncryption,
  });
};
