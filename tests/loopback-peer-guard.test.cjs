'use strict';
// Synthetic-only guard for the development API. A forged localhost Host header
// must not make a request from a non-loopback peer appear local.
const test = require('node:test');
const assert = require('node:assert/strict');
const { handle, isLocalRequest, isLoopbackPeer } = require('../backend/server');

const port = 8787;
const host = '127.0.0.1:' + port;
const remotePeers = [
  '192.0.2.45', '10.1.2.3', '172.16.1.1', '8.8.8.8',
  '::ffff:192.0.2.45', '2001:db8::1', 'fe80::1', 'not-an-ip', '', undefined
];

function requestFrom(address) {
  return {
    method: 'GET', url: '/health',
    headers: { host, origin: 'http://' + host },
    socket: { remoteAddress: address, localPort: port }
  };
}

test('development API accepts only real loopback peers, not a forged local Host', () => {
  for (const address of remotePeers) {
    assert.equal(isLoopbackPeer(address), false, String(address));
    assert.equal(isLocalRequest(requestFrom(address)), false, String(address));
  }
  for (const address of ['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1']) {
    assert.equal(isLoopbackPeer(address), true, address);
    assert.equal(isLocalRequest(requestFrom(address)), true, address);
  }
});

test('HTTP handler rejects remote peers before serving even the health route', () => {
  for (const address of ['192.0.2.45', '::ffff:192.0.2.45', '2001:db8::1']) {
    let status;
    let responseHeaders;
    let responseBody;
    const response = {
      writeHead(code, headers) { status = code; responseHeaders = headers; },
      end(body) { responseBody = body; }
    };
    handle(requestFrom(address), response);
    assert.equal(status, 403, address);
    assert.deepEqual(JSON.parse(responseBody), { error: 'local_origin_required' });
    assert.equal(responseHeaders['Cache-Control'], 'no-store');
    assert.equal(responseHeaders['Access-Control-Allow-Origin'], undefined);
  }
});
