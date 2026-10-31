'use strict';
// Isolated synthetic contract tests; no network, live credentials or client data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPreviewBearer } = require('../backend/preview-auth');
const token = Buffer.alloc(32, 42).toString('base64url');
const valid = () => ({ url: '/preview', rawHeaders: ['Authorization', 'Bearer ' + token] });

test('preview bearer accepts a canonical synthetic token only on a clean origin-form path', () => {
  assert.equal(verifyPreviewBearer(valid(), token), true);
});

test('preview bearer rejects ambiguous request targets and raw-header shapes', () => {
  const invalid = [
    { url: undefined },
    { url: null },
    { url: '//evil.example/preview' },
    { url: 'http://localhost/preview' },
    { url: '/preview?token=redacted' },
    { url: '/preview#fragment' },
    { rawHeaders: ['Authorization'] },
    { rawHeaders: ['Authorization', 'Bearer ' + token, 'Authorization', 'Bearer ' + token] },
    { rawHeaders: [null, 'Bearer ' + token] },
    { rawHeaders: ['Authorization', null] },
    { rawHeaders: ['Cookie', 'session=synthetic', 'Authorization', 'Bearer ' + token] },
    { rawHeaders: ['Proxy-Authorization', 'Bearer ' + token, 'Authorization', 'Bearer ' + token] },
  ];
  for (const overrides of invalid) {
    assert.equal(verifyPreviewBearer({ ...valid(), ...overrides }, token), false,
      'ambiguous request must fail closed');
  }
});
