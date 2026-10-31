'use strict';
// Synthetic regression tests only. The preview bearer primitive is NOT wired
// into any public API; these tests do not authorize deployment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPreviewToken, verifyPreviewBearer } = require('../backend/preview-auth');
const token = Buffer.alloc(32, 7).toString('base64url');
const req = (url, rawHeaders) => ({ url, rawHeaders });

test('preview bearer accepts exactly one canonical header on an origin-form path', () => {
  assert.equal(isValidPreviewToken(token), true);
  assert.equal(verifyPreviewBearer(req('/preview', ['Authorization', 'Bearer ' + token]), token), true);
});

test('preview bearer rejects URL query and fragment even with correct credential', () => {
  for (const url of ['/preview?token=redacted', '/preview#fragment', 'https://localhost/preview', '//localhost/preview', '']) {
    assert.equal(verifyPreviewBearer(req(url, ['Authorization', 'Bearer ' + token]), token), false, url);
  }
});

test('preview bearer rejects duplicate and ambient credentials', () => {
  for (const headers of [
    ['Authorization', 'Bearer ' + token, 'authorization', 'Bearer ' + token],
    ['Authorization', 'Bearer ' + token, 'Cookie', 'session=synthetic'],
    ['Authorization', 'Bearer ' + token, 'Proxy-Authorization', 'Bearer ' + token],
    ['Authorization', 'Bearer ' + token, 'Authorization'],
  ]) assert.equal(verifyPreviewBearer(req('/preview', headers), token), false);
});

test('preview bearer rejects malformed configured token and altered credentials', () => {
  assert.equal(verifyPreviewBearer(req('/preview', ['Authorization', 'Bearer ' + token]), 'not-a-token'), false);
  const other = Buffer.alloc(32, 8).toString('base64url');
  assert.equal(verifyPreviewBearer(req('/preview', ['Authorization', 'Bearer ' + other]), token), false);
});
