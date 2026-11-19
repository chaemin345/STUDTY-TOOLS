'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getMonthlyAiLimit, consumeMonthlyAiQuota } = require('../lib/server/quotas');

test('monthly AI limits match the plan tiers', () => {
  assert.equal(getMonthlyAiLimit({ plan: 'monthly' }), 100);
  assert.equal(getMonthlyAiLimit({ plan: 'yearly' }), 100);
  assert.equal(getMonthlyAiLimit({ plan: 'max_monthly' }), 500);
  assert.equal(getMonthlyAiLimit({ plan: 'pro_max' }), 500);
  assert.equal(getMonthlyAiLimit({ plan: 'master' }), 10000);
  assert.equal(getMonthlyAiLimit(null), 100);
});

test('monthly quota uses the authenticated user and current UTC month', async () => {
  let called;
  const result = await consumeMonthlyAiQuota(
    { id: 'user-123' },
    { plan: 'max_monthly' },
    async (path, options) => {
      called = { path, options };
      return 7;
    }
  );
  assert.equal(called.path, 'rpc/consume_ai_quota');
  assert.equal(called.options.method, 'POST');
  assert.equal(called.options.body.p_user_id, 'user-123');
  assert.equal(called.options.body.p_limit, 500);
  assert.equal(called.options.body.p_month, new Date().toISOString().slice(0, 7));
  assert.deepEqual(result, { month: called.options.body.p_month, used: 7, limit: 500 });
});

test('monthly quota fails closed when quota is exhausted or cannot be verified', async () => {
  await assert.rejects(
    () => consumeMonthlyAiQuota({ id: 'user-123' }, { plan: 'monthly' }, async () => 0),
    error => error.status === 429
  );
  await assert.rejects(
    () => consumeMonthlyAiQuota({ id: 'user-123' }, { plan: 'monthly' }, async () => 'not-a-number'),
    error => error.status === 503
  );
});


test('all AI endpoints share the same atomic monthly quota service', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const endpoint of ['assistant.js', 'pattern-analysis.js', 'study-plan.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'ai', endpoint), 'utf8');
    assert.match(source, /require\(['"]\.\.\/\.\.\/lib\/server\/quotas['"]\)/, endpoint + ' imports shared quota module');
    assert.match(source, /consumeMonthlyAiQuota\(user, subscription, dbRequest\)/, endpoint + ' consumes shared quota');
  }
});
