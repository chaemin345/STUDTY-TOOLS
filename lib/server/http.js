'use strict';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return send(res, 405, { error: '지원하지 않는 요청 방식입니다.' });
}

function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    throw new HttpError(400, '요청 데이터 형식이 올바르지 않습니다.');
  }
}

function handleError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const message = status >= 500 ? (status === 503 ? error.message : '서버 처리 중 오류가 발생했습니다.') : error.message;
  return send(res, status, { error: message });
}

module.exports = { HttpError, send, methodNotAllowed, readJson, handleError };