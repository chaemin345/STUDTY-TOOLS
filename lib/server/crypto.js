'use strict';

const crypto = require('node:crypto');
const { HttpError } = require('./http');

function encryptionKey() {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new HttpError(503, 'API 키 암호화 키가 설정되지 않았습니다.');
  }
  return Buffer.from(value, 'hex');
}

function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

function decryptSecret(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3) throw new HttpError(500, '저장된 API 키 형식이 올바르지 않습니다.');
  const [iv, tag, encrypted] = parts.map(x => Buffer.from(x, 'base64'));
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new HttpError(500, 'API 키 복호화에 실패했습니다. 암호화 키 설정을 확인하세요.');
  }
}

module.exports = { encryptSecret, decryptSecret };