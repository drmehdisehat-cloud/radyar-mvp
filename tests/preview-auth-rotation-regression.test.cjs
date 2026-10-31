'use strict';
// Synthetic token-rotation contract. Prototype only; not connected to an API.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPreviewBearer } = require('../backend/preview-auth');

const oldToken = Buffer.alloc(32, 17).toString('base64url');
const newToken = Buffer.alloc(32, 18).toString('base64url');
const request = token => ({
  url: '/preview',
  rawHeaders: ['Authorization', 'Bearer ' + token],
});

test('rotating configured preview credential revokes previous credential', () => {
  assert.equal(verifyPreviewBearer(request(oldToken), oldToken), true);
  assert.equal(verifyPreviewBearer(request(oldToken), newToken), false);
  assert.equal(verifyPreviewBearer(request(newToken), newToken), true);
  assert.equal(verifyPreviewBearer(request(newToken), oldToken), false);
});

test('missing configured credential fails closed even with valid request token', () => {
  for (const configured of [undefined, null, '', 'not-configured']) {
    assert.equal(verifyPreviewBearer(request(newToken), configured), false);
  }
});
