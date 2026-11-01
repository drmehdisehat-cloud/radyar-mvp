'use strict';
// Synthetic credential boundary regression. No listener or production secret.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewGate } = require('../backend/preview-gate');
const token = Buffer.alloc(32, 29).toString('base64url');
const other = Buffer.alloc(32, 30).toString('base64url');

function request() {
  return {
    url: '/preview',
    socket: { remoteAddress: '127.0.0.1', localPort: 4321 },
    headers: { host: 'localhost:4321' },
    rawHeaders: ['Host', 'localhost:4321', 'Authorization', 'Bearer ' + token],
  };
}
test('preview gate rejects absent or wrong configured credentials before downstream', () => {
  for (const configured of [undefined, null, '', other]) {
    let calls = 0;
    let status;
    let ended = false;
    createPreviewGate(configured, () => { calls++; })(request(), {
      writeHead(code, headers) {
        status = code;
        assert.equal(headers['Cache-Control'], 'no-store');
      },
      end() { ended = true; },
    });
    assert.equal(status, 401);
    assert.equal(ended, true);
    assert.equal(calls, 0);
  }
});
