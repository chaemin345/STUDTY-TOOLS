'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const supabasePath = require.resolve('../lib/server/supabase');
const integrationsPath = require.resolve('../lib/server/integrations');
const originalSupabase = require(supabasePath);
const originalIntegrations = require(integrationsPath);
async function invoke(plan) {
  let requestBody;
  require.cache[supabasePath].exports = { ...originalSupabase, requireUser: async () => ({ id: 'user-test' }), requirePro: async () => ({ plan, status: 'active' }), dbRequest: async (path) => path.startsWith('api_credentials') ? [{ provider: 'openai' }] : 1 };
  require.cache[integrationsPath].exports = { ...originalIntegrations, getCredential: async () => ({ provider: 'openai', secret: 'test-secret', model: 'gpt-test' }) };
  delete require.cache[require.resolve('../api/ai/pattern-analysis')];
  const handler = require('../api/ai/pattern-analysis');
  const oldFetch = global.fetch;
  global.fetch = async (_url, options) => { requestBody = JSON.parse(options.body); return { ok: true, json: async () => ({ choices: [{ message: { content: '근거 기반 테스트 결과' } }] }) }; };
  const response = { statusCode: 0, headers: {}, payload: null, setHeader(k, v) { this.headers[k] = v; return this; }, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
  try { await handler({ method: 'POST', headers: {}, body: { snapshot: { sessions: [{ date: '2026-11-13', subject: '수학', minutes: 40 }] } } }, response); }
  finally { global.fetch = oldFetch; require.cache[supabasePath].exports = originalSupabase; require.cache[integrationsPath].exports = originalIntegrations; }
  return { response, requestBody };
}
test('Pro uses structured three-part analysis', async () => { const { response, requestBody } = await invoke('monthly'); assert.equal(response.statusCode, 200); assert.equal(response.payload.analysisLevel, '구조화 분석'); assert.match(requestBody.messages[0].content, /3개 항목/); assert.doesNotMatch(requestBody.messages[0].content, /5개 분석 단계/); });
test('Pro Max uses deeper five-stage analysis', async () => { const { response, requestBody } = await invoke('max_monthly'); assert.equal(response.statusCode, 200); assert.equal(response.payload.analysisLevel, '다단계 심층 분석'); assert.match(requestBody.messages[0].content, /5개 분석 단계/); assert.match(requestBody.messages[0].content, /대안 설명/); });
