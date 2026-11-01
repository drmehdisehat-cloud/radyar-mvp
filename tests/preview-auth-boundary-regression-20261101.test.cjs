'use strict';
// Synthetic security regression tests. This prototype is not wired to the server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidPreviewToken, verifyPreviewBearer } = require('../backend/preview-auth');

const token = Buffer.alloc(32, 0x42).toString('base64url');
const valid = () => ({
  url: '/preview',
  rawHeaders: ['Authorization', 'Bearer ' + token],
  headers: { authorization: 'Bearer ' + token }
});

test('preview credential accepts only canonical 32-byte unpadded base64url', () => {
  assert.equal(isValidPreviewToken(token), true);
  for (const candidate of [
    Buffer.alloc(31, 0x42).toString('base64url'),
    Buffer.alloc(33, 0x42).toString('base64url'),
    token + '=', token.slice(0, -1) + '!', '', null
  ]) assert.equal(isValidPreviewToken(candidate), false);
});

test('preview bearer denies duplicate, conflicting, and ambient credentials', () => {
  assert.equal(verifyPreviewBearer(valid(), token), true);
  const cases = [
    { rawHeaders: ['Authorization', 'Bearer ' + token, 'authorization', 'Bearer ' + token] },
    { headers: { authorization: 'Bearer ' + Buffer.alloc(32, 0x43).toString('base64url') } },
    { rawHeaders: ['Authorization', 'Bearer ' + token, 'Cookie', 'sid=synthetic'] },
    { rawHeaders: ['Proxy-Authorization', 'Bearer ' + token, 'Authorization', 'Bearer ' + token] },
    { url: '/preview?token=synthetic' },
    { url: '//preview' },
    { url: 'https://example.invalid/preview' },
    { rawHeaders: ['Authorization'] }
  ];
  for (const overrides of cases) {
    assert.equal(verifyPreviewBearer({ ...valid(), ...overrides }, token), false,
      JSON.stringify(Object.keys(overrides)));
  }
});
