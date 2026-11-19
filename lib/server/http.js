'use strict';

const MAX_JSON_BODY_BYTES = 64 * 1024;

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
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  return res.status(status).json(payload);
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return send(res, 405, { error: '지원하지 않는 요청 방식입니다.' });
}

function assertBodySize(size) {
  if (size > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, '요청 데이터가 너무 큽니다. 64KB 이하로 줄여 주세요.');
  }
}

function readJson(req) {
  const contentLength = req?.headers?.['content-length'] ?? req?.headers?.['Content-Length'];
  if (contentLength !== undefined && contentLength !== null && contentLength !== '') {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      throw new HttpError(400, '요청 크기 헤더가 올바르지 않습니다.');
    }
    assertBodySize(declaredLength);
  }

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Array.isArray(req.body)) throw new HttpError(400, '요청 데이터 형식이 올바르지 않습니다.');
    let serialized;
    try { serialized = JSON.stringify(req.body); }
    catch { throw new HttpError(400, '요청 데이터 형식이 올바르지 않습니다.'); }
    assertBodySize(Buffer.byteLength(serialized, 'utf8'));
    return req.body;
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  assertBodySize(Buffer.byteLength(raw, 'utf8'));
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

module.exports = { HttpError, send, methodNotAllowed, readJson, handleError, MAX_JSON_BODY_BYTES };
