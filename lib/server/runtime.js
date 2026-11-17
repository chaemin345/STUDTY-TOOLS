'use strict';

function isNonProductionVercelRuntime() {
  const environment = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  return environment !== '' && environment !== 'production';
}

function isBackendEnabledForCurrentEnvironment() {
  if (!isNonProductionVercelRuntime()) return true;
  return process.env.STUDTY_ALLOW_NON_PRODUCTION_BACKEND === 'true';
}

module.exports = {
  isNonProductionVercelRuntime,
  isBackendEnabledForCurrentEnvironment,
};
