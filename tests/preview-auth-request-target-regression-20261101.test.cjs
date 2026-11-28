'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPreviewToken, verifyPreviewBearer } = require('../backend/preview-auth.js');

const token = Buffer.alloc(32, 0x37).toString('base64url');
function request(url, supplied = token) {
  return {
    url,
    rawHeaders: ['Host', 'example.invalid', 'Authorization', 'Bearer ' + supplied],
    headers: { authorization: 'Bearer ' + supplied }
  };
}

test('preview bearer rejects credential-bearing and ambiguous request targets', () => {
  assert.equal(isValidPreviewToken(token), true);
  for (const target of [
    '/preview?token=secret', '/preview#fragment',
    'https://example.invalid/preview', '//example.invalid/preview',
    '', undefined, null, 123
  ]) {
    assert.equal(verifyPreviewBearer(request(target), token), false, String(target));
  }
  assert.equal(verifyPreviewBearer(request('/preview'), token), true);
});

test('preview bearer rejects missing, malformed and noncanonical configured secrets', () => {
  for (const secret of [undefined, null, '', 'short', token + '=', token + '\n', 42]) {
    assert.equal(verifyPreviewBearer(request('/preview'), secret), false, String(secret));
  }
  assert.equal(verifyPreviewBearer(request('/preview', Buffer.alloc(32, 0x38).toString('base64url')), token), false);
});
