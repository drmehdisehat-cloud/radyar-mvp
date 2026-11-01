'use strict';
// Synthetic request shape regression for disconnected preview-auth primitive.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPreviewBearer } = require('../backend/preview-auth');
const token = Buffer.alloc(32, 29).toString('base64url');
const valid = ['Authorization', `Bearer ${token}`];
const request = rawHeaders => ({ url: '/preview', rawHeaders });

test('preview bearer refuses malformed raw header collections without throwing', () => {
  const malformed = [null, undefined, {}, 'Authorization', [],
    ['Authorization'], [...valid, 'X-Test'],
    [null, 'value', ...valid], [42, 'value', ...valid],
    ['Authorization', null], ['Authorization', 123],
    [...valid, 'Authorization', `Bearer ${token}`]];
  for (const headers of malformed) {
    assert.doesNotThrow(() => verifyPreviewBearer(request(headers), token));
    assert.equal(verifyPreviewBearer(request(headers), token), false);
  }
  assert.equal(verifyPreviewBearer(request(valid), token), true);
});
