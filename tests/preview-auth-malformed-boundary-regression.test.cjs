'use strict';
// Synthetic-only regression tests. This prototype is not wired to a public API.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPreviewBearer, isValidPreviewToken } = require('../backend/preview-auth');
const token = Buffer.alloc(32, 0x5a).toString('base64url');
const request = (url, rawHeaders) => ({ url, rawHeaders });
test('preview auth fails closed on malformed raw header arrays', () => {
  assert.equal(isValidPreviewToken(token), true);
  for (const rawHeaders of [null, {}, ['Authorization'], [42, 'Bearer ' + token], ['Authorization', 42], ['Authorization', 'Bearer ' + token, 'Extra']]) {
    assert.equal(verifyPreviewBearer(request('/', rawHeaders), token), false);
  }
});
test('preview auth rejects ambiguous request targets even with valid bearer', () => {
  const headers = ['Authorization', 'Bearer ' + token];
  for (const url of [null, '', '//evil.invalid/', 'http://localhost/', '/?token=hidden', '/#fragment', 123]) {
    assert.equal(verifyPreviewBearer(request(url, headers), token), false);
  }
  assert.equal(verifyPreviewBearer(request('/', headers), token), true);
});
test('preview auth rejects noncanonical token and ambient credentials', () => {
  const headers = ['Authorization', 'Bearer ' + token];
  assert.equal(verifyPreviewBearer(request('/', headers), token + '='), false);
  for (const name of ['Cookie', 'proxy-authorization']) {
    assert.equal(verifyPreviewBearer(request('/', [...headers, name, 'synthetic']), token), false);
  }
});
