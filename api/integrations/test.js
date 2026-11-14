'use strict';

const { send, methodNotAllowed, readJson, handleError, HttpError } = require('../../lib/server/http');
const { requireUser } = require('../../lib/server/supabase');
const { getCredential, testCredential, PROVIDERS } = require('../../lib/server/integrations');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const user = await requireUser(req);
    const { provider } = readJson(req);
    if (!PROVIDERS[provider]) throw new HttpError(400, '지원하지 않는 API 제공자입니다.');
    const credential = await getCredential(user, provider);
    await testCredential(provider, credential.secret);
    return send(res, 200, { success: true, message: `${PROVIDERS[provider].label} API 연결을 확인했습니다.` });
  } catch (error) { return handleError(res, error); }
};