'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  createPinnedReviewerJwtAuthenticator,
  DEFAULT_COOKIE
} = require('../backend/pinned-reviewer-jwt-authenticator.cjs');

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function fixture() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = Date.now();
  const issuer = 'https://identity.example.test/';
  const audience = 'dadyar-preview-review';
  const key = {
    kid: 'synthetic-review-key-01',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' })
  };
  const payload = {
    iss: issuer,
    sub: 'synthetic-reviewer-01',
    aud: audience,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 300,
    roles: ['preview-reviewer'],
    reviewer_independent: true
  };
  const token = (claims = payload, header = { alg: 'RS256', kid: key.kid, typ: 'JWT' }) => {
    const headerPart = b64url(JSON.stringify(header));
    const payloadPart = b64url(JSON.stringify(claims));
    const input = headerPart + '.' + payloadPart;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(input, 'ascii'), privateKey);
    return input + '.' + signature.toString('base64url');
  };
  const authenticate = (overrides = {}) => createPinnedReviewerJwtAuthenticator({
    issuer, audience, keys: [key], now: () => now, ...overrides
  });
  const request = value => ({ headers: { cookie: DEFAULT_COOKIE + '=' + value } });
  return { issuer, audience, key, privateKey, now, payload, token, authenticate, request };
}

async function rejectsAuthentication(authenticator, request) {
  await assert.rejects(() => authenticator(request), error =>
    error && error.code === 'AUTHENTICATED_REVIEWER_REQUIRED');
}

test('accepts a current pinned RS256 reviewer session and returns only the verified principal', async () => {
  const f = fixture();
  const authenticate = f.authenticate();
  const principal = await authenticate(f.request(f.token()));
  assert.deepEqual(principal, {
    authenticated: true,
    independent: true,
    issuer: f.issuer,
    subject: 'synthetic-reviewer-01',
    roles: ['preview-reviewer']
  });
  assert.equal(authenticate.adapterId, 'dadyar-pinned-rs256-reviewer-session-v1');
  assert.equal(Object.isFrozen(authenticate), true);
  assert.equal(Object.isFrozen(principal.roles), true);
});

test('rejects a missing, oversized or duplicated reviewer cookie', async () => {
  const f = fixture();
  const authenticate = f.authenticate();
  await rejectsAuthentication(authenticate, { headers: {} });
  await rejectsAuthentication(authenticate, { headers: { cookie: DEFAULT_COOKIE + '=' + 'x'.repeat(8200) } });
  await rejectsAuthentication(authenticate, {
    headers: { cookie: DEFAULT_COOKIE + '=' + f.token() + '; ' + DEFAULT_COOKIE + '=' + f.token() }
  });
});

test('rejects malformed compact JWTs, non-canonical base64url and invalid UTF-8', async () => {
  const f = fixture();
  const authenticate = f.authenticate();
  await rejectsAuthentication(authenticate, f.request('one.two'));
  await rejectsAuthentication(authenticate, f.request('a=.b.c'));
  const invalidUtf8Header = Buffer.from([0x7b, 0x22, 0x61, 0x6c, 0x67, 0x22, 0x3a, 0xff, 0x7d]).toString('base64url');
  const payloadPart = b64url(JSON.stringify(f.payload));
  const input = invalidUtf8Header + '.' + payloadPart;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input, 'ascii'), f.privateKey).toString('base64url');
  await rejectsAuthentication(authenticate, f.request(input + '.' + signature));
});

test('rejects duplicate JSON keys in a signed JWT header', async () => {
  const f = fixture();
  const headerPart = b64url('{"alg":"RS256","alg":"none","kid":"' + f.key.kid + '","typ":"JWT"}');
  const payloadPart = b64url(JSON.stringify(f.payload));
  const input = headerPart + '.' + payloadPart;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input, 'ascii'), f.privateKey).toString('base64url');
  await rejectsAuthentication(f.authenticate(), f.request(input + '.' + signature));
});

test('rejects algorithm substitution, unknown key IDs and invalid signatures', async () => {
  const f = fixture();
  await rejectsAuthentication(f.authenticate(), f.request(f.token(f.payload, {
    alg: 'HS256', kid: f.key.kid, typ: 'JWT'
  })));
  await rejectsAuthentication(f.authenticate(), f.request(f.token(f.payload, {
    alg: 'RS256', kid: 'untrusted-key', typ: 'JWT'
  })));
  const valid = f.token();
  const parts = valid.split('.');
  parts[2] = Buffer.alloc(256, 0).toString('base64url');
  await rejectsAuthentication(f.authenticate(), f.request(parts.join('.')));
});

test('requires exact issuer and audience, including authorized-party binding for multiple audiences', async () => {
  const f = fixture();
  await rejectsAuthentication(f.authenticate(), f.request(f.token({ ...f.payload, iss: 'https://attacker.example/' })));
  await rejectsAuthentication(f.authenticate(), f.request(f.token({ ...f.payload, aud: 'another-service' })));
  await rejectsAuthentication(f.authenticate(), f.request(f.token({
    ...f.payload, aud: [f.audience, 'another-service'], azp: 'another-service'
  })));
  const valid = await f.authenticate()(f.request(f.token({
    ...f.payload, aud: [f.audience, 'another-service'], azp: f.audience
  })));
  assert.equal(valid.authenticated, true);
});

test('rejects expired, future-dated and stale session assertions', async () => {
  const f = fixture();
  const current = Math.floor(f.now / 1000);
  const authenticate = f.authenticate();
  await rejectsAuthentication(authenticate, f.request(f.token({
    ...f.payload, iat: current - 600, exp: current - 1
  })));
  await rejectsAuthentication(authenticate, f.request(f.token({
    ...f.payload, iat: current + 180, exp: current + 300
  })));
  await rejectsAuthentication(authenticate, f.request(f.token({
    ...f.payload, iat: current - 400, exp: current + 300
  })));
  await rejectsAuthentication(authenticate, f.request(f.token({
    ...f.payload, iat: current, exp: current + 1200
  })));
});

test('requires the signed preview-reviewer role and an explicit independence claim', async () => {
  const f = fixture();
  const authenticate = f.authenticate();
  await rejectsAuthentication(authenticate, f.request(f.token({
    ...f.payload, roles: ['observer']
  })));
  await rejectsAuthentication(authenticate, f.request(f.token({
    ...f.payload, roles: ['preview-reviewer', 'preview-reviewer']
  })));
  await rejectsAuthentication(authenticate, f.request(f.token({
    ...f.payload, reviewer_independent: false
  })));
  await rejectsAuthentication(authenticate, f.request(f.token({
    ...f.payload, sub: 'synthetic-reviewer-\u202e01'
  })));
});

test('rejects invalid issuer, non-HTTPS configuration and unpinned or weak keys at construction', () => {
  const f = fixture();
  assert.throws(() => f.authenticate({ issuer: 'http://identity.example.test/' }), /canonical HTTPS/);
  assert.throws(() => f.authenticate({ audience: '' }), /audience/);
  assert.throws(() => f.authenticate({ cookieName: 'review-session' }), /fixed __Host-/);
  assert.throws(() => f.authenticate({ keys: [] }), /pinned reviewer public keys/);
  assert.throws(() => f.authenticate({ keys: [f.key, f.key] }), /duplicate pinned reviewer key/);

  const weak = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey
    .export({ type: 'spki', format: 'pem' });
  assert.throws(() => f.authenticate({
    keys: [{ kid: 'weak-key', publicKeyPem: weak }]
  }), /at least 2048 bits/);
});

test('never accepts reviewer identity or role assertions from request headers', async () => {
  const f = fixture();
  const authenticate = f.authenticate();
  await rejectsAuthentication(authenticate, { headers: {
    'x-authenticated-user': 'synthetic-reviewer-01',
    'x-reviewer-role': 'preview-reviewer',
    'x-reviewer-independent': 'true'
  } });
  const request = f.request(f.token());
  request.headers['x-authenticated-user'] = 'synthetic-reviewer-01';
  request.headers['x-reviewer-role'] = 'preview-reviewer';
  request.headers['x-reviewer-independent'] = 'true';
  // The signed session cookie remains the only identity input; the HTTP boundary separately rejects these headers.
  const principal = await authenticate(request);
  assert.equal(principal.subject, 'synthetic-reviewer-01');
});
