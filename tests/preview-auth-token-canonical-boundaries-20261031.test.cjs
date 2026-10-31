'use strict';
// Synthetic, isolated preview-auth regression; no live secrets or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPreviewToken, verifyPreviewBearer } = require('../backend/preview-auth');
const token = Buffer.alloc(32, 0x5a).toString('base64url');
const request = value => ({
  url: '/preview',
  rawHeaders: ['Authorization', 'Bearer ' + value],
  headers: { authorization: 'Bearer ' + value },
});

test('only canonical unpadded 32-byte base64url preview credentials qualify', () => {
  assert.equal(isValidPreviewToken(token), true);
  const invalid = [
    Buffer.alloc(31, 0x5a).toString('base64url'),
    Buffer.alloc(33, 0x5a).toString('base64url'),
    token + '=',
    token + '\n',
    token.replace(/.$/, '!'),
    '',
    null,
    undefined,
  ];
  for (const value of invalid) {
    assert.equal(isValidPreviewToken(value), false, 'noncanonical token must fail');
    assert.equal(verifyPreviewBearer(request(value), token), false,
      'noncanonical bearer must not authenticate');
  }
});

test('canonical wrong-length configured secrets fail closed even with valid request token', () => {
  for (const configured of [Buffer.alloc(31).toString('base64url'),
    Buffer.alloc(33).toString('base64url'), null, '']) {
    assert.equal(verifyPreviewBearer(request(token), configured), false);
  }
});
