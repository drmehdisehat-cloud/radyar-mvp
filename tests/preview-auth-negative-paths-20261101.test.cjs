'use strict';
// Isolated preview-auth negative-path tests. Never use live credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyPreviewBearer } = require('../backend/preview-auth');

const configured = Buffer.alloc(32, 0x52).toString('base64url');
const other = Buffer.alloc(32, 0x53).toString('base64url');
const request = (authorization) => ({
  url: '/preview',
  rawHeaders: ['Authorization', authorization],
  headers: { authorization }
});

test('preview bearer denies well-formed but incorrect credential', () => {
  assert.equal(verifyPreviewBearer(request('Bearer ' + other), configured), false);
  assert.equal(verifyPreviewBearer(request('Bearer ' + configured), other), false);
});

test('preview bearer rejects ambiguous authorization formatting', () => {
  for (const value of [
    'bearer ' + configured,
    'Bearer  ' + configured,
    'Bearer\t' + configured,
    'Basic ' + configured,
    'Bearer ' + configured + ' ',
    'Bearer ' + configured + ', Bearer ' + configured
  ]) assert.equal(verifyPreviewBearer(request(value), configured), false);
});

test('preview bearer rejects malformed configured secret and incomplete request', () => {
  const valid = request('Bearer ' + configured);
  for (const secret of [undefined, '', 'not-a-secret', other + '=']) {
    assert.equal(verifyPreviewBearer(valid, secret), false);
  }
  for (const invalid of [null, {}, { url: '/preview' }, { rawHeaders: valid.rawHeaders }]) {
    assert.equal(verifyPreviewBearer(invalid, configured), false);
  }
});
