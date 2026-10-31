'use strict';
// Synthetic peer-identity regression: disconnected preview gate only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocalPreviewRequest } = require('../backend/preview-gate');

function fakeRequest(peer) {
  return {
    socket: { remoteAddress: peer, localPort: 43210 },
    headers: { host: '127.0.0.1:43210' },
    rawHeaders: ['Host', '127.0.0.1:43210'],
  };
}

test('only exact loopback peer identities pass the preview origin boundary', () => {
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(isLocalPreviewRequest(fakeRequest(peer)), true, peer);
  }
  for (const peer of ['127.0.0.2', '127.1.2.3', '::ffff:127.0.0.2',
    '192.168.1.10', '::ffff:192.168.1.10', '0.0.0.0', '', undefined]) {
    assert.equal(isLocalPreviewRequest(fakeRequest(peer)), false, String(peer));
  }
});
