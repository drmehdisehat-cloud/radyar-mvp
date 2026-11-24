'use strict';
// Synthetic negative-path tests only. No real credentials or network listeners.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPreviewBearer } = require('../backend/preview-auth');
const { isLocalPreviewRequest } = require('../backend/preview-gate');
const token = Buffer.alloc(32, 0x51).toString('base64url');
const authorization = 'Bearer ' + token;

test('disconnected preview primitives reject missing request objects without throwing', () => {
  for (const request of [undefined, null, false, 0, '', {}]) {
    assert.equal(verifyPreviewBearer(request, token), false);
    assert.equal(isLocalPreviewRequest(request), false);
  }
});

test('preview bearer rejects URL query, fragment and absolute-form targets', () => {
  for (const url of ['/preview?token=synthetic', '/preview#fragment',
    'http://localhost/preview', '//localhost/preview', undefined, 42]) {
    assert.equal(verifyPreviewBearer({
      url, rawHeaders: ['Authorization', authorization],
      headers: { authorization },
    }, token), false);
  }
});
