'use strict';
// Synthetic boundary regression: proxy identity hints must never authorize preview.
// No network listener, production credentials, or personal information.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewGate } = require('../backend/preview-gate');
const token = Buffer.alloc(32, 47).toString('base64url');
const forbidden = [
  'forwarded', 'via', 'x-real-ip', 'proxy-connection',
  'x-original-host', 'x-original-url', 'x-rewrite-url',
  'cf-connecting-ip', 'true-client-ip', 'fastly-client-ip',
  'x-client-ip', 'x-cluster-client-ip', 'x-envoy-external-address',
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
];
test('valid bearer never overrides forbidden proxy headers', () => {
  for (const name of forbidden) {
    let calls = 0;
    let status;
    let ended = false;
    const req = {
      socket: { remoteAddress: '127.0.0.1', localPort: 4321 },
      headers: { host: 'localhost:4321', [name]: '127.0.0.1' },
      rawHeaders: ['Host', 'localhost:4321', 'Authorization', 'Bearer ' + token, name, '127.0.0.1'],
    };
    createPreviewGate(token, () => { calls++; })(req, {
      writeHead(code, headers) {
        status = code;
        assert.equal(headers['Cache-Control'], 'no-store');
      },
      end() { ended = true; },
    });
    assert.equal(status, 401, name);
    assert.equal(ended, true, name);
    assert.equal(calls, 0, name);
  }
});
