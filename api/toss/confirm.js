'use strict';

const { send, methodNotAllowed, readJson, handleError, HttpError } = require('../../lib/server/http');
const { requireUser, dbRequest } = require('../../lib/server/supabase');

const PLAN_DAYS = { monthly: 30, yearly: 365 };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const user = await requireUser(req);
    const { paymentKey, orderId, amount } = readJson(req);
    if (typeof paymentKey !== 'string' || paymentKey.length < 10 || paymentKey.length > 200 || typeof orderId !== 'string' || !Number.isInteger(amount) || amount < 1) {
      throw new HttpError(400, '결제 승인 데이터가 올바르지 않습니다.');
    }
    const orders = await dbRequest(`billing_orders?order_id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(user.id)}&select=order_id,user_id,plan,amount,status,payment_key&limit=1`);
    const order = Array.isArray(orders) ? orders[0] : null;
    if (!order) throw new HttpError(404, '주문을 찾을 수 없습니다.');
    if (Number(order.amount) !== amount) throw new HttpError(400, '주문 금액이 일치하지 않습니다.');
    if (!PLAN_DAYS[order.plan]) throw new HttpError(400, '주문 상품 정보가 올바르지 않습니다.');

    if (order.status !== 'paid') {
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

      const existingRows = await dbRequest(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=expires_at,status&limit=1`);
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      const now = new Date();
      const currentExpiry = existing?.status === 'active' ? new Date(existing.expires_at) : null;
      const starts = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
      const expires = new Date(starts.getTime() + PLAN_DAYS[order.plan] * 86400000);

      await dbRequest(`billing_orders?order_id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { status: 'paid', payment_key: paymentKey, paid_at: now.toISOString(), payment_method: payment.method || null },
      });
      await dbRequest('subscriptions?on_conflict=user_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { user_id: user.id, plan: order.plan, status: 'active', starts_at: starts.toISOString(), expires_at: expires.toISOString(), payment_key: paymentKey, order_id: orderId, updated_at: now.toISOString() },
      });
    } else if (order.payment_key && order.payment_key !== paymentKey) {
      throw new HttpError(409, '이미 처리된 주문과 결제 키가 일치하지 않습니다.');
    }

    const subscriptionRows = await dbRequest(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=plan,status,starts_at,expires_at&limit=1`);
    const subscription = Array.isArray(subscriptionRows) ? subscriptionRows[0] || null : null;
    return send(res, 200, { success: true, subscription });
  } catch (error) { return handleError(res, error); }
};