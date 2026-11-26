'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createOidcReviewerAuthenticator } = require('../backend/oidc-reviewer-authenticator.cjs');

const ISSUER = 'https://identity.example.test/';
const AUDIENCE = 'dadyar-preview-release-api';
const REVIEW_ISSUER = 'synthetic-owner-review-registry';

function fixture() {
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = Date.now();
  const key = {
    kid: 'synthetic-oidc-key-01',
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' })
  };
  const claims = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'synthetic-reviewer-01',
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 300,
    jti: crypto.randomBytes(32).toString('base64url'),
    roles: ['preview-reviewer'],
    reviewer_independent: true
  };
  const makeToken = (patch = {}) => {
    const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    const header = encode({ alg: 'RS256', typ: 'JWT', kid: key.kid });
    const payload = encode({ ...claims, ...patch });
    const input = header + '.' + payload;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(input, 'ascii'), keys.privateKey);
    return input + '.' + signature.toString('base64url');
  };
  const create = (overrides = {}) => createOidcReviewerAuthenticator({
    issuer: ISSUER,
    audience: AUDIENCE,
    reviewIssuer: REVIEW_ISSUER,
    keys: [key],
    now: () => now,
    isSessionActive: async () => true,
    ...overrides
  });
  const request = token => ({
    headers: { authorization: 'Bearer ' + token },
    rawHeaders: ['authorization', 'Bearer ' + token]
  });
  return { now, claims, makeToken, create, request };
}

async function rejectsAuth(authenticator, request) {
  await assert.rejects(() => authenticator(request), error =>
    error && error.code === 'AUTHENTICATED_REVIEWER_REQUIRED');
}

test('requires a trusted server-side revocation callback and bounded timeout', () => {
  const f = fixture();
  assert.throws(() => createOidcReviewerAuthenticator({
    issuer: ISSUER,
    audience: AUDIENCE,
    reviewIssuer: REVIEW_ISSUER,
    keys: [f.create().pinnedKeys]
  }), /session status callback/);
  for (const value of [0, 9, 5001, 1.5, NaN]) {
    assert.throws(() => f.create({ sessionStatusTimeoutMs: value }), /10 through 5000/);
  }
});

test('accepts only a fresh pinned token with exact reviewer role, independence and a valid jti', async () => {
  const f = fixture();
  const principal = await f.create()(f.request(f.makeToken()));
  assert.deepEqual(principal, {
    authenticated: true,
    issuer: REVIEW_ISSUER,
    identityIssuer: ISSUER,
    subject: 'synthetic-reviewer-01',
    independent: true,
    roles: ['preview-reviewer']
  });
  for (const patch of [
    { jti: undefined },
    { jti: 'short' },
    { reviewer_independent: false },
    { independent: true, reviewer_independent: undefined },
    { roles: ['preview-reviewer', 'admin'] },
    { roles: ['observer'] }
  ]) {
    await rejectsAuth(f.create(), f.request(f.makeToken(patch)));
  }
});

test('binds revocation lookup to the verified issuer, subject and jti', async () => {
  const f = fixture();
  let observed;
  const authenticate = f.create({
    isSessionActive: async context => { observed = context; return true; }
  });
  await authenticate(f.request(f.makeToken()));
  assert.deepEqual({
    issuer: observed.issuer,
    subject: observed.subject,
    tokenId: observed.tokenId,
    issuedAt: observed.issuedAt,
    expiresAt: observed.expiresAt
  }, {
    issuer: ISSUER,
    subject: f.claims.sub,
    tokenId: f.claims.jti,
    issuedAt: f.claims.iat,
    expiresAt: f.claims.exp
  });
  assert.ok(observed.signal instanceof AbortSignal);
  assert.equal(observed.signal.aborted, false);
});

test('revoked, unavailable and timed-out session status all fail closed', async () => {
  const f = fixture();
  await rejectsAuth(f.create({ isSessionActive: async () => false }), f.request(f.makeToken()));
  await rejectsAuth(f.create({ isSessionActive: async () => { throw new Error('synthetic outage'); } }), f.request(f.makeToken()));

  let signal;
  const stalled = f.create({
    sessionStatusTimeoutMs: 10,
    isSessionActive: ({ signal: value }) => new Promise(() => { signal = value; })
  });
  await rejectsAuth(stalled, f.request(f.makeToken()));
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, true);
});
