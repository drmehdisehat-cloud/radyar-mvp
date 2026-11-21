'use strict';
// Synthetic-only fail-closed request-target regression for the isolated
// preview credential verifier. Not wired to the development API.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPreviewBearer } = require('../backend/preview-auth');

const token = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64url');
const rawHeaders = ['Authorization', 'Bearer ' + token];

test('preview verifier requires an explicit origin-form request target', () => {
  for (const url of [undefined, null, 42, '', 'preview', '//example.invalid/preview',
    'https://example.invalid/preview', '/preview?access_token=synthetic', '/preview#fragment']) {
    assert.equal(verifyPreviewBearer({ url, rawHeaders }, token), false,
      'missing, malformed, or credential-bearing request target must deny');
  }
  assert.equal(verifyPreviewBearer({ url: '/preview', rawHeaders }, token), true);
  assert.equal(verifyPreviewBearer({ url: '/', rawHeaders }, token), true);
});
