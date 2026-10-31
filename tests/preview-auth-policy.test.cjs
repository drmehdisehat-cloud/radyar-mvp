'use strict';
// Synthetic-only tests. This module is deliberately NOT wired into server.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPreviewToken, verifyPreviewBearer } = require('../backend/preview-auth');

const token = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64url');
const other = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 2)).toString('base64url');
const req = (...rawHeaders) => ({ url: '/preview', rawHeaders });

test('preview credential format requires canonical 256-bit base64url encoding', () => {
  assert.equal(isValidPreviewToken(token), true);
  for (const invalid of [undefined, null, '', 'demo', token + '=', token + 'A',
    token.slice(0, -1) + '*', token.slice(0, -1) + 'B', 'a'.repeat(42)]) {
    assert.equal(isValidPreviewToken(invalid), false, String(invalid));
  }
});

test('preview verifier defaults to denial and never accepts URL or cookie credentials', () => {
  assert.equal(verifyPreviewBearer(req('Host', '127.0.0.1'), token), false);
  assert.equal(verifyPreviewBearer(req('Authorization', 'Bearer ' + token), undefined), false);
  assert.equal(verifyPreviewBearer(req('Authorization', 'Bearer ' + token), 'demo'), false);
  assert.equal(verifyPreviewBearer({ headers: { authorization: 'Bearer ' + token } }, token), false);
  assert.equal(verifyPreviewBearer(req('Cookie', 'access=' + token), token), false);
  assert.equal(verifyPreviewBearer(null, token), false);
});

test('preview verifier accepts exactly one well-formed Authorization header', () => {
  assert.equal(verifyPreviewBearer(req('Host', 'localhost', 'Authorization', 'Bearer ' + token), token), true);
  assert.equal(verifyPreviewBearer(req('authorization', 'Bearer ' + token), token), true);
  assert.equal(verifyPreviewBearer(req('Authorization', 'Bearer ' + other), token), false);
  for (const bad of ['bearer ' + token, 'Bearer  ' + token, 'Bearer ' + token + ' ',
    'Basic ' + token, 'Bearer ' + token + ', Bearer ' + token]) {
    assert.equal(verifyPreviewBearer(req('Authorization', bad), token), false, bad);
  }
});

test('preview verifier rejects ambiguous raw headers and duplicate credentials', () => {
  assert.equal(verifyPreviewBearer(req('Authorization', 'Bearer ' + token, 'AUTHORIZATION', 'Bearer ' + token), token), false);
  assert.equal(verifyPreviewBearer(req('Authorization', 'Bearer ' + token, 'Authorization', 'Bearer ' + other), token), false);
  assert.equal(verifyPreviewBearer({ rawHeaders: ['Authorization'] }, token), false);
  assert.equal(verifyPreviewBearer({ rawHeaders: [null, 'Bearer ' + token] }, token), false);
  assert.equal(verifyPreviewBearer({ rawHeaders: ['Authorization', null] }, token), false);
});
