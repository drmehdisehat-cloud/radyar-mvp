'use strict';
// Synthetic parser-boundary regression: never use real client credentials.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPreviewBearer } = require('../backend/preview-auth');
const token = Buffer.alloc(32, 42).toString('base64url');
const auth = 'Bearer ' + token;
const request = headers => ({ url: '/preview', rawHeaders: ['Authorization', auth], headers });

test('preview auth accepts matching normalized and raw Authorization', () => {
  assert.equal(verifyPreviewBearer(request({ authorization: auth }), token), true);
});

test('preview auth denies contradictory normalized Authorization', () => {
  for (const value of ['Bearer invalid', '', null, 123, auth + ' ', auth.toLowerCase()]) {
    assert.equal(verifyPreviewBearer(request({ authorization: value }), token), false);
  }
});
