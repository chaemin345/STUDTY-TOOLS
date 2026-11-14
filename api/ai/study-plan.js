'use strict';

const { send, methodNotAllowed, readJson, handleError, HttpError } = require('../../lib/server/http');
const { requireUser } = require('../../lib/server/supabase');
const { getCredential, generateStudyPlan, PROVIDERS } = require('../../lib/server/integrations');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const user = await requireUser(req);
    const { snapshot } = readJson(req);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new HttpError(400, '학습 데이터가 올바르지 않습니다.');
    const { dbRequest, requirePro } = require('../../lib/server/supabase');
    await requirePro(user);
    const rows = await dbRequest(`api_credentials?user_id=eq.${encodeURIComponent(user.id)}&select=provider&order=updated_at.desc&limit=1`);
    const provider = Array.isArray(rows) ? rows[0]?.provider : null;
    if (!provider || !PROVIDERS[provider]) throw new HttpError(400, '먼저 OpenAI, Anthropic 또는 Gemini API를 연결하세요.');
    const credential = await getCredential(user, provider);
    const plan = await generateStudyPlan(credential, snapshot);
    return send(res, 200, { plan, provider });
  } catch (error) { return handleError(res, error); }
};