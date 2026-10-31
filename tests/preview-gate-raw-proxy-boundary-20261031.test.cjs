'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocalPreviewRequest } = require('../backend/preview-gate');

function request(extraRaw = [], extraHeaders = {}) {
  return {
    socket: { remoteAddress: '127.0.0.1', localPort: 43121 },
    headers: { host: 'localhost:43121', ...extraHeaders },
    rawHeaders: ['Host', 'localhost:43121', ...extraRaw],
  };
}

test('local baseline accepted', () => {
  assert.equal(isLocalPreviewRequest(request()), true);
});

test('wire-level proxy headers rejected even if normalized map omits them', () => {
  for (const name of ['X-Forwarded-For', 'Forwarded', 'Via', 'X-Real-IP', 'x-FoRwArDeD-hOsT']) {
    assert.equal(isLocalPreviewRequest(request([name, '127.0.0.1'])), false, name);
  }
});

test('raw proxy metadata rejected even when normalized headers disagree', () => {
  assert.equal(isLocalPreviewRequest(request(['X-Forwarded-Proto', 'https'], { 'x-forwarded-proto': undefined })), false);
});
