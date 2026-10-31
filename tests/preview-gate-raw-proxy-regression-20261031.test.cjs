'use strict';
// Synthetic regression for raw proxy metadata that middleware may omit.
// This disconnected preview gate is NOT approved for network deployment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocalPreviewRequest } = require('../backend/preview-gate');

function request(extraRaw = [], extraHeaders = {}) {
  return {
    socket: { remoteAddress: '127.0.0.1', localPort: 41871 },
    headers: { host: 'localhost:41871', ...extraHeaders },
    rawHeaders: ['Host', 'localhost:41871', ...extraRaw],
  };
}

test('local preview rejects proxy metadata even when normalized headers omit it', () => {
  assert.equal(isLocalPreviewRequest(request()), true);
  for (const name of [
    'Forwarded', 'FORWARDED', 'Via', 'X-Real-IP',
    'X-Forwarded-For', 'x-FORWARDED-host', 'Proxy-Connection',
    'X-Original-URL', 'CF-Connecting-IP', 'True-Client-IP',
  ]) {
    assert.equal(isLocalPreviewRequest(request([name, 'synthetic.invalid'])), false, name);
  }
});

test('local preview rejects duplicate raw Host even if normalized Host appears valid', () => {
  assert.equal(isLocalPreviewRequest(request(['HOST', 'localhost:41871'])), false);
  assert.equal(isLocalPreviewRequest(request(['Origin', 'http://localhost:41871'],
    { origin: 'http://localhost:41871' })), true);
  assert.equal(isLocalPreviewRequest(request(['Origin', 'http://localhost:41871'],
    { origin: 'http://other.invalid' })), false);
});
