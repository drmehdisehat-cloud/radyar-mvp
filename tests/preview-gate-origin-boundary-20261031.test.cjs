'use strict';
// Synthetic, disconnected preview-gate tests. No listener, secrets or client data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewGate, isLocalPreviewRequest } = require('../backend/preview-gate');
const token = Buffer.alloc(32, 31).toString('base64url');
function request(overrides = {}) {
  return {
    url: '/preview',
    socket: { remoteAddress: '127.0.0.1', localPort: 4321 },
    headers: { host: 'localhost:4321', origin: 'http://localhost:4321', 'sec-fetch-site': 'same-origin' },
    rawHeaders: ['Host', 'localhost:4321', 'Authorization', 'Bearer ' + token],
    ...overrides,
  };
}
test('local preview gate permits exact local origin and invokes downstream once', () => {
  let calls = 0;
  const next = () => { calls++; };
  const gate = createPreviewGate(token, next);
  gate(request(), { writeHead() { throw Error('unexpected denial'); }, end() {} });
  assert.equal(calls, 1);
});
test('preview gate denies spoofed or contradictory origins before downstream', () => {
  const invalid = [
    { headers: { host: 'localhost:4321', origin: 'https://localhost:4321' } },
    { headers: { host: 'localhost:4321', origin: 'http://evil.example' } },
    { headers: { host: 'localhost:4321', 'sec-fetch-site': 'cross-site' } },
    { headers: { host: 'localhost:4322' } },
    { headers: { host: 'localhost:4321' }, rawHeaders: ['Host', '127.0.0.1:4321', 'Authorization', 'Bearer ' + token] },
    { socket: { remoteAddress: '127.0.0.2', localPort: 4321 } },
    { headers: { host: 'localhost:4321', 'x-forwarded-host': 'localhost:4321' } },
  ];
  for (const override of invalid) {
    let calls = 0, status, ended = false;
    const gate = createPreviewGate(token, () => { calls++; });
    gate(request(override), {
      writeHead(code, headers) { status = code; assert.equal(headers['Cache-Control'], 'no-store'); },
      end() { ended = true; },
    });
    assert.equal(status, 401);
    assert.equal(ended, true);
    assert.equal(calls, 0);
  }
});
test('raw host mismatch is rejected by local boundary', () => {
  assert.equal(isLocalPreviewRequest(request({
    headers: { host: 'localhost:4321' },
    rawHeaders: ['Host', 'localhost:4321', 'Host', 'localhost:4321', 'Authorization', 'Bearer ' + token],
  })), false);
});
