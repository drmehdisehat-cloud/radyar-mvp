'use strict';
// Synthetic regression: reject ambiguous Host metadata before the downstream handler.
// This prototype is disconnected from production APIs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocalPreviewRequest } = require('../backend/preview-gate');

function request(rawHost, normalizedHost) {
  return {
    socket: { remoteAddress: '127.0.0.1', localPort: 43210 },
    headers: { host: normalizedHost },
    rawHeaders: ['Host', rawHost],
  };
}

test('local preview accepts a matching canonical Host', () => {
  assert.equal(isLocalPreviewRequest(request('localhost:43210', 'localhost:43210')), true);
});

test('local preview rejects disagreement between raw and normalized Host', () => {
  for (const normalized of ['127.0.0.1:43210', 'localhost:43211', 'localhost:43210 ']) {
    assert.equal(isLocalPreviewRequest(request('localhost:43210', normalized)), false);
  }
});
