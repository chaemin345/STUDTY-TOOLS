'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getSupabaseEnv } = require('../lib/server/supabase');

function withEnv(values, callback) {
  const keys = Object.keys(values);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('modern Supabase publishable/secret keys are accepted', () => {
  withEnv({
    SUPABASE_URL: 'https://example.supabase.co/',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    SUPABASE_ANON_KEY: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  }, () => {
    assert.deepEqual(getSupabaseEnv(), {
      url: 'https://example.supabase.co',
      anonKey: 'sb_publishable_test',
      serviceKey: 'sb_secret_test',
    });
  });
});

test('legacy Supabase anon/service-role keys remain supported', () => {
  withEnv({
    SUPABASE_URL: 'https://legacy.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: undefined,
    SUPABASE_SECRET_KEY: undefined,
    SUPABASE_ANON_KEY: 'legacy_anon',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy_service_role',
  }, () => {
    assert.deepEqual(getSupabaseEnv(), {
      url: 'https://legacy.supabase.co',
      anonKey: 'legacy_anon',
      serviceKey: 'legacy_service_role',
    });
  });
});
