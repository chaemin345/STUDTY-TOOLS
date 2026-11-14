'use strict';

const { HttpError } = require('./http');
const { dbRequest, requirePro } = require('./supabase');
const { decryptSecret } = require('./crypto');

const PROVIDERS = {
  openai: { label: 'OpenAI', defaultModel: 'gpt-4.1-mini' },
  anthropic: { label: 'Anthropic', defaultModel: 'claude-3-5-haiku-latest' },
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-2.5-flash' },
};

function validProvider(provider) {
  if (!Object.prototype.hasOwnProperty.call(PROVIDERS, provider)) throw new HttpError(400, '지원하지 않는 API 제공자입니다.');
  return PROVIDERS[provider];
}

async function getCredential(user, provider) {
  validProvider(provider);
  await requirePro(user);
  const rows = await dbRequest(`api_credentials?user_id=eq.${encodeURIComponent(user.id)}&provider=eq.${encodeURIComponent(provider)}&select=provider,model,secret_ciphertext,updated_at&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new HttpError(404, '해당 API가 연결되어 있지 않습니다.');
  return { provider: row.provider, model: row.model, secret: decryptSecret(row.secret_ciphertext), updatedAt: row.updated_at };
}

function providerHeaders(provider, secret) {
  if (provider === 'openai') return { Authorization: `Bearer ${secret}` };
  if (provider === 'anthropic') return { 'x-api-key': secret, 'anthropic-version': '2023-06-01' };
  if (provider === 'gemini') return { 'x-goog-api-key': secret };
  throw new HttpError(400, '지원하지 않는 API 제공자입니다.');
}

async function testCredential(provider, secret) {
  const urls = {
    openai: 'https://api.openai.com/v1/models?limit=1',
    anthropic: 'https://api.anthropic.com/v1/models?limit=1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
  };
  const response = await fetch(urls[provider], {
    headers: providerHeaders(provider, secret),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new HttpError(400, 'API 키가 유효하지 않거나 제공자 권한이 부족합니다.');
    throw new HttpError(502, `API 제공자가 오류를 반환했습니다. (HTTP ${response.status})`);
  }
  return true;
}

async function generateText(credential, systemPrompt, userPrompt, options = {}) {
  const maxTokens = Math.max(100, Math.min(4000, Number(options.maxTokens) || 1000));
  const temperature = Math.max(0, Math.min(1, Number(options.temperature ?? 0.3)));
  let url, headers, body;
  if (credential.provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { ...providerHeaders('openai', credential.secret), 'Content-Type': 'application/json' };
    body = { model: credential.model || PROVIDERS.openai.defaultModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: maxTokens, temperature };
  } else if (credential.provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = { ...providerHeaders('anthropic', credential.secret), 'Content-Type': 'application/json' };
    body = { model: credential.model || PROVIDERS.anthropic.defaultModel, system: systemPrompt, max_tokens: maxTokens, temperature, messages: [{ role: 'user', content: userPrompt }] };
  } else if (credential.provider === 'gemini') {
    const model = String(credential.model || PROVIDERS.gemini.defaultModel).replace(/^models\//, '');
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers = { ...providerHeaders('gemini', credential.secret), 'Content-Type': 'application/json' };
    body = { systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts: [{ text: userPrompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature } };
  } else {
    throw new HttpError(400, '지원하지 않는 AI 제공자입니다.');
  }
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload?.error?.message || payload?.message;
    throw new HttpError(502, details ? `AI API 오류: ${String(details).slice(0, 180)}` : `AI 제공자가 오류를 반환했습니다. (HTTP ${response.status})`);
  }
  const output = responseText(credential.provider, payload).trim();
  if (!output) throw new HttpError(502, 'AI 응답이 비어 있습니다. 모델 ID와 API 권한을 확인하세요.');
  return output;
}

function responseText(provider, payload) {
  if (provider === 'openai') return payload?.choices?.[0]?.message?.content || payload?.output_text || '';
  if (provider === 'anthropic') return (payload?.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
  if (provider === 'gemini') return (payload?.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('\n');
  return '';
}

async function generateStudyPlan(credential, snapshot) {
  const safe = {
    examName: String(snapshot.examName || '목표 시험').slice(0, 50),
    examDate: String(snapshot.examDate || '').slice(0, 10),
    dailyGoal: Math.max(10, Math.min(1440, Number(snapshot.dailyGoal) || 180)),
    subjects: Array.isArray(snapshot.subjects) ? snapshot.subjects.filter(x => typeof x === 'string').slice(0, 20) : [],
    tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks.slice(0, 40) : [],
    sessions: Array.isArray(snapshot.sessions) ? snapshot.sessions.slice(-120) : [],
  };
  const prompt = `너는 학습 데이터 분석가다. 아래 데이터만 근거로 다음 7일 학습 계획을 한국어로 작성하라. 과목별 시간 배분, 미완료 과제 우선순위, 매일의 구체적인 학습 블록, 휴식과 복습을 포함하라. 데이터가 부족하면 추정임을 명시하고 가짜 측정값을 만들지 말라. 1,000자 이내로 간결하게 작성하라.\n\n학습 데이터:\n${JSON.stringify(safe)}`;
  let url, body, headers;
  if (credential.provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { ...providerHeaders('openai', credential.secret), 'Content-Type': 'application/json' };
    body = { model: credential.model || PROVIDERS.openai.defaultModel, messages: [{ role: 'system', content: 'You are a precise study planning assistant. Do not invent data.' }, { role: 'user', content: prompt }], max_tokens: 1400, temperature: 0.3 };
  } else if (credential.provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = { ...providerHeaders('anthropic', credential.secret), 'Content-Type': 'application/json' };
    body = { model: credential.model || PROVIDERS.anthropic.defaultModel, max_tokens: 1400, messages: [{ role: 'user', content: prompt }] };
  } else {
    const model = String(credential.model || PROVIDERS.gemini.defaultModel).replace(/^models\//, '');
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers = { ...providerHeaders('gemini', credential.secret), 'Content-Type': 'application/json' };
    body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1400, temperature: 0.3 } };
  }
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload?.error?.message || payload?.message;
    throw new HttpError(502, details ? `AI API 오류: ${String(details).slice(0, 180)}` : `AI 제공자가 오류를 반환했습니다. (HTTP ${response.status})`);
  }
  const plan = responseText(credential.provider, payload).trim();
  if (!plan) throw new HttpError(502, 'AI 응답에서 학습 계획을 찾지 못했습니다. 모델 ID를 확인하세요.');
  return plan.slice(0, 12000);
}

module.exports = { PROVIDERS, validProvider, getCredential, providerHeaders, testCredential, generateText, generateStudyPlan };
