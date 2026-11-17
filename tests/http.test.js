'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError, readJson, send, MAX_JSON_BODY_BYTES } = require('../lib/server/http');

test('readJson accepts a small JSON object', () => {
  assert.deepEqual(readJson({ body: { provider: 'openai' }, headers: {} }), { provider: 'openai' });
  assert.deepEqual(readJson({ body: '{"provider":"openai"}', headers: {} }), { provider: 'openai' });
});

test('readJson rejects oversized declared and actual bodies with 413', () => {
  assert.throws(
    () => readJson({ body: '{}', headers: { 'content-length': String(MAX_JSON_BODY_BYTES + 1) } }),
    error => error instanceof HttpError && error.status === 413
  );
  const raw = JSON.stringify({ value: 'x'.repeat(MAX_JSON_BODY_BYTES + 1) });
  assert.throws(
    () => readJson({ body: raw, headers: {} }),
    error => error instanceof HttpError && error.status === 413
  );
});

test('readJson rejects arrays and malformed JSON', () => {
  assert.throws(() => readJson({ body: '[]', headers: {} }), error => error.status === 400);
  assert.throws(() => readJson({ body: '{broken', headers: {} }), error => error.status === 400);
});

test('API responses include baseline security and no-cache headers', () => {
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  send(response, 200, { ok: true });
  assert.equal(response.statusCode, 200);
  assert.equal(headers['Cache-Control'], 'no-store, max-age=0');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
});
