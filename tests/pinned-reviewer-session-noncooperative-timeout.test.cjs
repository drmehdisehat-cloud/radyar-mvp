'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createPinnedReviewerJwtAuthenticator } = require('../backend/pinned-reviewer-jwt-authenticator.cjs');

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function makeReviewerToken(privateKey, nowMs) {
  const header = b64urlJson({ alg: 'RS256', kid: 'reviewer-test', typ: 'JWT' });
  const payload = b64urlJson({
    iss: 'https://reviewer.example.test/',
    aud: 'dadyar-preview',
    sub: 'reviewer-qa-01',
    jti: Buffer.alloc(16, 7).toString('base64url'),
    reviewer_independent: true,
    roles: ['preview-reviewer'],
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + 120
  });
  const signingInput = header + '.' + payload;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'ascii'), privateKey)
    .toString('base64url');
  return signingInput + '.' + signature;
}

test('non-cooperative session store timeout rejects reviewer authentication without waiting for its promise', {
  timeout: 2000
}, async () => {
  const now = Date.now();
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001
  });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const authenticateReviewer = createPinnedReviewerJwtAuthenticator({
    issuer: 'https://reviewer.example.test/',
    audience: 'dadyar-preview',
    keys: [{ kid: 'reviewer-test', publicKeyPem }],
    now: () => now,
    sessionStatusTimeoutMs: 30,
    // Deliberately ignore AbortSignal and never settle. Promise.race must still fail closed.
    isSessionActive: () => new Promise(() => {})
  });
  const token = makeReviewerToken(privateKey, now);
  const started = process.hrtime.bigint();

  await assert.rejects(
    authenticateReviewer({
      headers: { cookie: '__Host-dadyar-review-session=' + token }
    }),
    error => error && error.code === 'AUTHENTICATED_REVIEWER_REQUIRED'
  );

  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 1000, 'authentication should fail within the bounded timeout');
});
