'use strict';

const crypto = require('node:crypto');
const { send, methodNotAllowed, readJson, handleError, HttpError } = require('../../lib/server/http');
const { requireUser, dbRequest } = require('../../lib/server/supabase');
const { PLANS } = require('../../lib/server/plans');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const user = await requireUser(req);
    const body = readJson(req);
    const plan = PLANS[body.plan];
    if (!plan) throw new HttpError(400, '선택한 이용권이 올바르지 않습니다.');
    const orderId = `STUDTY-${crypto.randomUUID().replace(/-/g, '')}`;
    await dbRequest('billing_orders', {
      method: 'POST',
      prefer: 'return=minimal',
      body: { order_id: orderId, user_id: user.id, plan: body.plan, amount: plan.amount, status: 'pending' },
    });
    return send(res, 200, { orderId, amount: plan.amount, orderName: plan.label, days: plan.days });
  } catch (error) { return handleError(res, error); }
};