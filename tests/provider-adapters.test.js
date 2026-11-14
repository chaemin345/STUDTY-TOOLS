'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateText } = require('../lib/server/integrations');
const cases = [
  { provider: 'openai', expectedUrl: 'https://api.openai.com/v1/chat/completions', payload: { choices: [{ message: { content: 'OpenAI 응답' } }] } },
  { provider: 'anthropic', expectedUrl: 'https://api.anthropic.com/v1/messages', payload: { content: [{ type: 'text', text: 'Anthropic 응답' }] } },
  { provider: 'gemini', expectedUrl: /generativelanguage\.googleapis\.com/, payload: { candidates: [{ content: { parts: [{ text: 'Gemini 응답' }] } }] } },
];
for (const item of cases) {
  test(`${item.provider} text adapter formats requests and reads responses`, async () => {
    const originalFetch = global.fetch; let calledUrl = ''; let calledOptions;
    global.fetch = async (url, options) => { calledUrl = url; calledOptions = options; return { ok: true, json: async () => item.payload }; };
    try {
      const text = await generateText({ provider: item.provider, secret: 'test-secret', model: 'test-model' }, 'system', 'user prompt', { maxTokens: 400, temperature: 0.2 });
      assert.equal(text, `${item.provider === 'openai' ? 'OpenAI' : item.provider === 'anthropic' ? 'Anthropic' : 'Gemini'} 응답`);
      if (item.expectedUrl instanceof RegExp) assert.match(calledUrl, item.expectedUrl); else assert.equal(calledUrl, item.expectedUrl);
      assert.equal(calledOptions.method, 'POST'); assert.match(calledOptions.headers['Content-Type'], /application\/json/);
    } finally { global.fetch = originalFetch; }
  });
}
