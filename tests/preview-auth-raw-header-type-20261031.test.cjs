'use strict';
// Synthetic type-boundary regression. No real credentials, client data or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPreviewBearer } = require('../backend/preview-auth');

const token = Buffer.alloc(32, 0x37).toString('base64url');
const authorization = 'Bearer ' + token;
const request = rawHeaders => ({
  url: '/preview',
  rawHeaders,
  headers: { authorization },
});

test('preview bearer denies malformed raw header arrays and duplicate mixed-case credentials', () => {
  const invalid = [
    null, undefined, {}, 'Authorization', [],
    ['Authorization'], ['Authorization', authorization, 'X-Other'],
    [42, authorization], ['Authorization', 42],
    ['Authorization', authorization, 'authorization', authorization],
    ['AUTHORIZATION', authorization, 'Authorization', authorization],
  ];
  for (const rawHeaders of invalid) {
    assert.equal(verifyPreviewBearer(request(rawHeaders), token), false);
  }
});

test('preview bearer requires raw and normalized authorization to agree', () => {
  assert.equal(verifyPreviewBearer(request(['Authorization', authorization]), token), true);
  assert.equal(verifyPreviewBearer({
    ...request(['Authorization', authorization]),
    headers: { authorization: 'Bearer ' + Buffer.alloc(32, 0x38).toString('base64url') },
  }, token), false);
});
