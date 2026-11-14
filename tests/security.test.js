'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { encryptSecret, decryptSecret } = require('../lib/server/crypto');
const { PLANS } = require('../lib/server/plans');

test('integration API keys encrypt and decrypt without plaintext storage', () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  const secret = 'sk-test-secret-value-for-unit-test-987654321';
  const encrypted = encryptSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted), secret);
});

test('plan prices and durations are server-owned', () => {
  assert.deepEqual(PLANS.monthly, {
    amount: 4900,
    label: 'STUDTY PRO 30일 이용권',
    days: 30,
    publicLabel: 'PRO · 30일',
  });
  assert.equal(PLANS.yearly.amount, 49000);
  assert.equal(PLANS.yearly.days, 365);
});