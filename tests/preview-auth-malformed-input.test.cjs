'use strict';
// Synthetic malformed-input regressions for the isolated, non-deployed verifier.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPreviewToken, verifyPreviewBearer } = require('../backend/preview-auth');
const token = Buffer.alloc(32, 17).toString('base64url');
const authorized = ['Authorization', 'Bearer ' + token];

test('rejects absent or structurally malformed request objects without throwing', () => {
  const cases = [null, undefined, false, 0, '', {}, { url: '/' },
    { url: '/', rawHeaders: null }, { url: '/', rawHeaders: {} },
    { url: '/', rawHeaders: ['Authorization'] },
    { url: '/', rawHeaders: [null, 'Bearer ' + token] },
    { url: '/', rawHeaders: ['Authorization', null] }];
  for (const request of cases) assert.equal(verifyPreviewBearer(request, token), false);
});

test('rejects ambiguous or non-string targets even with valid bearer', () => {
  for (const url of [undefined, null, 0, {}, [], '//preview', '/preview?x=1', '/preview#x']) {
    assert.equal(verifyPreviewBearer({ url, rawHeaders: authorized }, token), false);
  }
});

test('rejects noncanonical tokens and malformed Authorization syntax', () => {
  for (const invalid of [null, undefined, '', token + '=', token.slice(0, -1),
    token + '\n', ' ' + token, token.replace(/.$/, '!')]) {
    assert.equal(isValidPreviewToken(invalid), false);
    assert.equal(verifyPreviewBearer({ url: '/', rawHeaders: authorized }, invalid), false);
  }
  for (const value of ['bearer ' + token, 'Bearer  ' + token, 'Bearer\t' + token,
    'Bearer ' + token + ' ', 'Basic ' + token]) {
    assert.equal(verifyPreviewBearer({ url: '/', rawHeaders: ['Authorization', value] }, token), false);
  }
});
