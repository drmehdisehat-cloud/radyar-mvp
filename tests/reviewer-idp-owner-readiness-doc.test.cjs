'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('reviewer IdP owner runbook covers the trust and operational boundaries', () => {
  const doc = read('docs/REVIEWER-IDP-OWNER-INTEGRATION-FA.md');
  for (const required of [
    'NOT CONFIGURED',
    'issuer',
    'audience',
    'RS256',
    'kid',
    'reviewer_independent',
    'session',
    'revocation',
    '__Host-dadyar-review-session',
    'Secure',
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Ed25519',
    'Trust Store',
    'SHA-256',
    'TLS',
    'Origin',
    'Fetch Metadata',
    'replay',
    'Sandbox',
    'Secret Manager',
    'API',
    'گفت‌وگوی هوشمند عمومی خاموش'
  ]) {
    assert.ok(doc.toLowerCase().includes(required.toLowerCase()),
      'owner runbook must document: ' + required);
  }
});

test('development API remains separate from the signed reviewer report route', () => {
  const server = read('backend/server.js');
  assert.doesNotMatch(server, /\/api\/dadyar\/review-report|createSignedReviewReleaseHttpServer/,
    'the development-only API must not silently expose the signed report release route');
});

test('the signed-review HTTP integration suite retains negative-path coverage', () => {
  const integration = read('tests/pinned-reviewer-jwt-http.integration.test.cjs');
  for (const required of [
    'reviewer identity headers without a signed session cookie',
    'revoked sessions and unavailable revocation state',
    'stalled revocation lookup',
    'missing and expired reviewer sessions'
  ]) {
    assert.ok(integration.includes(required), 'missing integration scenario: ' + required);
  }
});
