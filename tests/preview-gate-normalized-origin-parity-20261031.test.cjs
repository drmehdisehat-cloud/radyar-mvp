'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocalPreviewRequest } = require('../backend/preview-gate');

function request(extraHeaders = {}, extraRaw = []) {
  return {
    socket: { remoteAddress: '127.0.0.1', localPort: 48321 },
    headers: { host: 'localhost:48321', ...extraHeaders },
    rawHeaders: ['Host', 'localhost:48321', ...extraRaw],
  };
}

test('loopback preview accepts matching origin metadata only', () => {
  assert.equal(isLocalPreviewRequest(request()), true);
  assert.equal(isLocalPreviewRequest(request(
    { origin: 'http://localhost:48321', 'sec-fetch-site': 'same-origin' },
    ['Origin', 'http://localhost:48321', 'Sec-Fetch-Site', 'same-origin'],
  )), true);
});

test('loopback preview denies normalized origin metadata absent from raw headers', () => {
  assert.equal(isLocalPreviewRequest(request({ origin: 'http://localhost:48321' })), false);
  assert.equal(isLocalPreviewRequest(request({ 'sec-fetch-site': 'same-origin' })), false);
  assert.equal(isLocalPreviewRequest(request(
    { origin: 'http://localhost:48321', 'sec-fetch-site': 'same-origin' },
    ['Origin', 'http://localhost:48321'],
  )), false);
});
