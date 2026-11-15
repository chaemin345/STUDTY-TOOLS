'use strict';

const { send, methodNotAllowed, readJson, handleError, HttpError } = require('../lib/server/http');
const { requireUser, requirePro, dbRequest } = require('../lib/server/supabase');
const { encryptSecret } = require('../lib/server/crypto');
const { PROVIDERS, validProvider } = require('../lib/server/integrations');

module.exports = async function handler(req, res) {
  try {
    const user = await requireUser(req);
    // Deleting a stored key must always work, even after Pro has expired.
    if (req.method !== 'DELETE') await requirePro(user);
    if (req.method === 'GET') {
      const rows = await dbRequest(`api_credentials?user_id=eq.${encodeURIComponent(user.id)}&select=provider,model,updated_at&order=provider.asc`);
      return send(res, 200, { integrations: Array.isArray(rows) ? rows : [] });
    }
    if (req.method === 'POST') {
      const body = readJson(req);
      const provider = String(body.provider || '');
      const info = validProvider(provider);
      const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
      const model = typeof body.model === 'string' ? body.model.trim().slice(0, 100) : info.defaultModel;
      if (secret.length < 20 || secret.length > 500) throw new HttpError(400, 'API 키 길이가 올바르지 않습니다.');
      await dbRequest('api_credentials?on_conflict=user_id,provider', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { user_id: user.id, provider, model: model || info.defaultModel, secret_ciphertext: encryptSecret(secret), updated_at: new Date().toISOString() },
      });
      return send(res, 200, { success: true });
    }
    if (req.method === 'DELETE') {
      const provider = String(req.query?.provider || '');
      validProvider(provider);
      await dbRequest(`api_credentials?user_id=eq.${encodeURIComponent(user.id)}&provider=eq.${encodeURIComponent(provider)}`, { method: 'DELETE', prefer: 'return=minimal' });
      return send(res, 200, { success: true });
    }
    return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  } catch (error) { return handleError(res, error); }
};