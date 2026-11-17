'use strict';

const { HttpError } = require('./http');

function getMonthlyAiLimit(subscription) {
  const plan = String(subscription?.plan || '');
  if (plan === 'master') return 10000;
  if (plan.startsWith('max_') || plan === 'pro_max') return 500;
  return 100;
}

async function consumeMonthlyAiQuota(user, subscription, dbRequest) {
  if (!user?.id || typeof dbRequest !== 'function') {
    throw new HttpError(401, '사용자 인증을 확인할 수 없습니다.');
  }

  const limit = getMonthlyAiLimit(subscription);
  const month = new Date().toISOString().slice(0, 7);
  const result = await dbRequest('rpc/consume_ai_quota', {
    method: 'POST',
    body: {
      p_user_id: user.id,
      p_month: month,
      p_limit: limit,
    },
  });

  const used = Number(result);
  if (!Number.isInteger(used) || used < 0) {
    throw new HttpError(503, 'AI 사용량 한도를 확인할 수 없습니다. 잠시 후 다시 시도하세요.');
  }
  if (used === 0) {
    throw new HttpError(429, `이번 달 AI 사용 한도(${limit}회)에 도달했습니다.`);
  }

  return { month, used, limit };
}

module.exports = { getMonthlyAiLimit, consumeMonthlyAiQuota };
