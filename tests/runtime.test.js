'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { isBackendEnabledForCurrentEnvironment, getSupabaseProjectRef } = require('../lib/server/runtime');

function hash(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }

function withEnvironment(values, run) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try { run(); }
  finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const productionSecret = 'production-secret-never-used-here';
const productionEncryption = 'a'.repeat(64);
const safePreview = {
  VERCEL_ENV: 'preview',
  STUDTY_ALLOW_NON_PRODUCTION_BACKEND: 'true',
  SUPABASE_URL: 'https://preview-project.supabase.co',
  SUPABASE_SECRET_KEY: 'preview-secret',
  INTEGRATION_ENCRYPTION_KEY: 'b'.repeat(64),
  STUDTY_PRODUCTION_SUPABASE_PROJECT_REF: 'production-project',
  STUDTY_PRODUCTION_SUPABASE_SECRET_SHA256: hash(productionSecret),
  STUDTY_PRODUCTION_ENCRYPTION_KEY_SHA256: hash(productionEncryption),
};

test('production backend remains enabled without non-production guard variables', () => {
  withEnvironment({ VERCEL_ENV: 'production', STUDTY_ALLOW_NON_PRODUCTION_BACKEND: undefined }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), true);
  });
});

test('preview and development backends are disabled by default', () => {
  withEnvironment({ VERCEL_ENV: 'preview', STUDTY_ALLOW_NON_PRODUCTION_BACKEND: undefined }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), false);
  });
  withEnvironment({ VERCEL_ENV: 'development', STUDTY_ALLOW_NON_PRODUCTION_BACKEND: 'false' }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), false);
  });
});

test('opt-in is insufficient without a separately identified Supabase project and unique secrets', () => {
  withEnvironment({ ...safePreview, STUDTY_PRODUCTION_SUPABASE_PROJECT_REF: undefined }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), false);
  });
  withEnvironment({ ...safePreview, SUPABASE_URL: 'https://production-project.supabase.co' }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), false);
  });
  withEnvironment({ ...safePreview, SUPABASE_SECRET_KEY: productionSecret }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), false);
  });
  withEnvironment({ ...safePreview, INTEGRATION_ENCRYPTION_KEY: productionEncryption }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), false);
  });
  withEnvironment({ ...safePreview, STUDTY_PRODUCTION_SUPABASE_SECRET_SHA256: undefined }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), false);
  });
});

test('preview backend enables only with explicit opt-in, separate project, and unique secrets', () => {
  withEnvironment(safePreview, () => assert.equal(isBackendEnabledForCurrentEnvironment(), true));
});

test('project ref parser accepts only Supabase HTTPS project URLs', () => {
  assert.equal(getSupabaseProjectRef('https://abc-123.supabase.co'), 'abc-123');
  assert.equal(getSupabaseProjectRef('http://abc.supabase.co'), null);
  assert.equal(getSupabaseProjectRef('https://user:pass@abc.supabase.co'), null);
  assert.equal(getSupabaseProjectRef('https://example.com'), null);
});

test('local non-Vercel development remains configurable', () => {
  withEnvironment({ VERCEL_ENV: undefined, STUDTY_ALLOW_NON_PRODUCTION_BACKEND: undefined }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), true);
  });
});
