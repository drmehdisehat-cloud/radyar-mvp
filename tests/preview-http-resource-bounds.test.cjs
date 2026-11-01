'use strict';
// Synthetic-only regression: the disconnected preview harness must retain
// bounded HTTP parser and request timeouts. Not a deployment approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewTestServer } = require('../backend/preview-http');

const token = Buffer.alloc(32, 19).toString('base64url');

test('preview harness enforces finite HTTP resource bounds before listening', () => {
  const server = createPreviewTestServer(token, (_req, res) => res.end());
  assert.equal(server.listening, false);
  assert.equal(server.maxHeaderSize, 8192);
  assert.equal(server.requestTimeout, 10000);
  assert.equal(server.headersTimeout, 5000);
  assert.ok(server.headersTimeout <= server.requestTimeout);
  assert.equal(server.listenerCount('checkContinue') > 0, true);
  assert.equal(server.listenerCount('checkExpectation') > 0, true);
});
