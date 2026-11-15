'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { encryptSecret, decryptSecret } = require('../lib/server/crypto');

test('integration API keys encrypt and decrypt without plaintext storage', () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  const secret = 'sk-test-secret-value-for-unit-test-987654321';
  const encrypted = encryptSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted), secret);
});

test('paid checkout and payment-provider endpoints are not shipped', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'api/config.js'), 'utf8');
  assert.doesNotMatch(html, /TossPayments|requestPayment|tossClientKey|checkoutModal/);
  assert.doesNotMatch(html, /api\/billing\/create-order|api\/toss\/confirm/);
  assert.doesNotMatch(config, /TOSS_CLIENT_KEY|TOSS_SECRET_KEY|backendReady|PLANS/);
  assert.equal(fs.existsSync(path.join(root, 'api/billing/create-order.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'api/toss/confirm.js')), false);
});
