'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isMasterGoogleUser } = require('../lib/server/supabase');

const masterEmail = 'kcm791012@gmail.com';

test('master is recognized from Google identity and verified email', () => {
  assert.equal(isMasterGoogleUser({
    email: masterEmail,
    email_confirmed_at: '2026-11-01T00:00:00Z',
    identities: [{ provider: 'google' }],
  }, masterEmail), true);
});

test('master is recognized from trusted app_metadata when identities are omitted', () => {
  assert.equal(isMasterGoogleUser({
    email: masterEmail,
    email_confirmed_at: '2026-11-01T00:00:00Z',
    app_metadata: { provider: 'google', providers: ['google'] },
  }, masterEmail), true);
});

test('confirmed_at is accepted as a verification timestamp fallback', () => {
  assert.equal(isMasterGoogleUser({
    email: masterEmail,
    confirmed_at: '2026-11-01T00:00:00Z',
    app_metadata: { providers: ['google'] },
  }, masterEmail), true);
});

test('unverified or non-Google users cannot receive master entitlement', () => {
  assert.equal(isMasterGoogleUser({ email: masterEmail, identities: [{ provider: 'google' }] }, masterEmail), false);
  assert.equal(isMasterGoogleUser({
    email: masterEmail,
    email_confirmed_at: '2026-11-01T00:00:00Z',
    identities: [{ provider: 'email' }],
    app_metadata: { provider: 'email' },
  }, masterEmail), false);
});

test('email comparison is case-insensitive but exact', () => {
  assert.equal(isMasterGoogleUser({
    email: 'KCM791012@GMAIL.COM',
    email_confirmed_at: '2026-11-01T00:00:00Z',
    app_metadata: { provider: 'google' },
  }, masterEmail), true);
  assert.equal(isMasterGoogleUser({
    email: 'kcm791012+other@gmail.com',
    email_confirmed_at: '2026-11-01T00:00:00Z',
    app_metadata: { provider: 'google' },
  }, masterEmail), false);
});

test('user_metadata is never trusted as proof of Google identity', () => {
  assert.equal(isMasterGoogleUser({
    email: masterEmail,
    email_confirmed_at: '2026-11-01T00:00:00Z',
    user_metadata: { provider: 'google' },
  }, masterEmail), false);
});
