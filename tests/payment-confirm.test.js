'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getOrderDisposition, shouldApplyEntitlement } = require('../api/toss/confirm');

test('only pending orders can be newly confirmed', () => {
  assert.equal(getOrderDisposition({ status: 'pending' }, 'pay_key_123456'), 'confirm');
  assert.equal(getOrderDisposition({ status: 'paid', payment_key: 'pay_key_123456' }, 'pay_key_123456'), 'paid');
  assert.equal(getOrderDisposition({ status: 'paid', payment_key: 'different_key' }, 'pay_key_123456'), 'conflict');
  for (const status of ['failed', 'canceled', 'unknown', null]) {
    assert.equal(getOrderDisposition({ status }, 'pay_key_123456'), 'closed');
  }
});

test('subscription recovery is idempotent and does not replay older paid orders', () => {
  const paidAt = new Date('2026-11-16T00:00:00.000Z');
  assert.equal(shouldApplyEntitlement(null, 'order-a', paidAt), true);
  assert.equal(shouldApplyEntitlement({ order_id: 'order-a', updated_at: '2026-11-16T00:01:00.000Z' }, 'order-a', paidAt), false);
  assert.equal(shouldApplyEntitlement({ order_id: 'order-b', updated_at: '2026-11-17T00:00:00.000Z' }, 'order-a', paidAt), false);
  assert.equal(shouldApplyEntitlement({ order_id: 'order-old', updated_at: '2026-11-15T00:00:00.000Z' }, 'order-a', paidAt), true);
});
