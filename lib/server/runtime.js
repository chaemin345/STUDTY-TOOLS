'use strict';

const { createHash } = require('node:crypto');

function isNonProductionVercelRuntime() {
  const environment = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  return environment !== '' && environment !== 'production';
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function getSupabaseProjectRef(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const match = url.hostname.toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isBackendEnabledForCurrentEnvironment() {
  if (!isNonProductionVercelRuntime()) return true;
  if (process.env.STUDTY_ALLOW_NON_PRODUCTION_BACKEND !== 'true') return false;

  // Fail closed unless this deployment proves it is isolated from production.
  const projectRef = getSupabaseProjectRef(process.env.SUPABASE_URL);
  const productionProjectRef = String(process.env.STUDTY_PRODUCTION_SUPABASE_PROJECT_REF || '').trim().toLowerCase();
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  const productionSecretFingerprint = String(process.env.STUDTY_PRODUCTION_SUPABASE_SECRET_SHA256 || '').trim().toLowerCase();
  const productionEncryptionFingerprint = String(process.env.STUDTY_PRODUCTION_ENCRYPTION_KEY_SHA256 || '').trim().toLowerCase();

  if (!projectRef || !productionProjectRef || projectRef === productionProjectRef) return false;
  if (!secretKey || !encryptionKey) return false;
  if (!/^[a-f0-9]{64}$/.test(productionSecretFingerprint) || !/^[a-f0-9]{64}$/.test(productionEncryptionFingerprint)) return false;
  if (sha256(secretKey) === productionSecretFingerprint) return false;
  if (sha256(encryptionKey) === productionEncryptionFingerprint) return false;
  return true;
}

module.exports = {
  isNonProductionVercelRuntime,
  isBackendEnabledForCurrentEnvironment,
  getSupabaseProjectRef,
};
