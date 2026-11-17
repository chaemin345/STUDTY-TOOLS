'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isBackendEnabledForCurrentEnvironment } = require('../lib/server/runtime');

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

test('production backend remains enabled', () => {
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

test('non-production backend requires an explicit opt-in', () => {
  withEnvironment({ VERCEL_ENV: 'preview', STUDTY_ALLOW_NON_PRODUCTION_BACKEND: 'true' }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), true);
  });
});

test('local non-Vercel development remains configurable', () => {
  withEnvironment({ VERCEL_ENV: undefined, STUDTY_ALLOW_NON_PRODUCTION_BACKEND: undefined }, () => {
    assert.equal(isBackendEnabledForCurrentEnvironment(), true);
  });
});
