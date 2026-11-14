'use strict';
// Synthetic offline regression. No network listener, client data or credentials.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocalPreviewRequest, createPreviewGate } = require('../backend/preview-gate');
const token = Buffer.alloc(32, 42).toString('base64url');
function req(host, localPort) {
  return {
    url: '/preview',
    socket: { remoteAddress: '127.0.0.1', localPort },
    headers: { host },
    rawHeaders: ['Host', host, 'Authorization', 'Bearer ' + token],
  };
}
test('only canonical, nonzero listener ports pass the preview Host boundary', () => {
  for (const [host, port] of [
    ['localhost:00080', 80], ['localhost:0', 0],
    ['localhost:65536', 65536], ['localhost:080', 80],
    ['localhost:4321', undefined], ['localhost:4321', '4321'],
    ['localhost:4322', 4321],
  ]) {
    assert.equal(isLocalPreviewRequest(req(host, port)), false, host);
    let status, calls = 0;
    createPreviewGate(token, () => { calls++; })(req(host, port), {
      writeHead(code) { status = code; }, end() {},
    });
    assert.equal(status, 401, host);
    assert.equal(calls, 0, host);
  }
  for (const host of ['localhost:4321', '127.0.0.1:4321', '[::1]:4321']) {
    assert.equal(isLocalPreviewRequest(req(host, 4321)), true, host);
  }
});
