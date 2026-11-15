'use strict';

const { send, methodNotAllowed, readJson, handleError, HttpError } = require('../../lib/server/http');
const { requireUser, dbRequest } = require('../../lib/server/supabase');
const { PLANS } = require('../../lib/server/plans');

const ORDER_FIELDS = 'order_id,user_id,plan,amount,status,payment_key,paid_at';

function getOrderDisposition(order, paymentKey) {
  if (order?.status === 'pending') return 'confirm';
  if (order?.status === 'paid') return order.payment_key === paymentKey ? 'paid' : 'conflict';
  return 'closed';
}

function shouldApplyEntitlement(existing, orderId, paidAt) {
  if (!existing) return true;
  if (existing.order_id === orderId) return false;
  const updatedAt = new Date(existing.updated_at).getTime();
  return !Number.isFinite(updatedAt) || updatedAt < paidAt.getTime();
}

async function getOrder(orderId, userId) {
  const rows = await dbRequest(`billing_orders?order_id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(userId)}&select=${ORDER_FIELDS}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const user = await requireUser(req);
    const { paymentKey, orderId, amount } = readJson(req);
    if (
      typeof paymentKey !== 'string' || paymentKey.length < 10 || paymentKey.length > 200 ||
      typeof orderId !== 'string' || orderId.length < 8 || orderId.length > 80 ||
      !Number.isSafeInteger(amount) || amount < 1
    ) {
      throw new HttpError(400, '결제 승인 데이터가 올바르지 않습니다.');
    }

    let order = await getOrder(orderId, user.id);
    if (!order) throw new HttpError(404, '주문을 찾을 수 없습니다.');
    if (Number(order.amount) !== amount) throw new HttpError(400, '주문 금액이 일치하지 않습니다.');
    const plan = PLANS[order.plan];
    if (!plan || !Number.isInteger(plan.days) || plan.days < 1) {
      throw new HttpError(400, '주문 상품 정보가 올바르지 않습니다.');
    }

    const disposition = getOrderDisposition(order, paymentKey);
    if (disposition === 'conflict') {
      throw new HttpError(409, '이미 처리된 주문과 결제 키가 일치하지 않습니다.');
    } else if (disposition === 'confirm') {
      const secret = process.env.TOSS_SECRET_KEY;
      if (!secret) throw new HttpError(503, '토스페이먼츠 Secret Key가 설정되지 않았습니다.');
      const basic = Buffer.from(`${secret}:`, 'utf8').toString('base64');
      let tossResponse;
      try {
        tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': orderId,
          },
          body: JSON.stringify({ paymentKey, orderId, amount }),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw new HttpError(503, '토스페이먼츠 승인 서버에 연결할 수 없습니다.');
      }

      const payment = await tossResponse.json().catch(() => ({}));
      if (!tossResponse.ok || payment.status !== 'DONE') {
        const message = payment.message || '결제 승인을 확인하지 못했습니다.';
        throw new HttpError(400, String(message).slice(0, 180));
      }
      if (payment.orderId !== orderId || Number(payment.totalAmount) !== amount || payment.paymentKey !== paymentKey) {
        throw new HttpError(400, '결제 응답의 주문 정보 또는 금액이 일치하지 않습니다.');
      }

      // Compare-and-set prevents a stale or canceled order from being marked paid.
      const updatedRows = await dbRequest(
        `billing_orders?order_id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(user.id)}&status=eq.pending`,
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: {
            status: 'paid',
            payment_key: paymentKey,
            paid_at: new Date().toISOString(),
            payment_method: payment.method || null,
          },
        },
      );
      if (Array.isArray(updatedRows) && updatedRows.length === 1) {
        order = updatedRows[0];
      } else {
        // Another identical request may win the race. Accept only its exact payment.
        order = await getOrder(orderId, user.id);
        if (order+-j۬�����^�������