'use strict';
// Synthetic-only listener-boundary regression for the disconnected preview
// harness. No production credentials, client records, or public deployment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewTestServer } = require('../backend/preview-http');

const token = Buffer.alloc(32, 7).toString('base64url');

test('preview listener rejects implicit/public binds and alternate transports', async () => {
  const server = createPreviewTestServer(token, (_req, res) => res.end());
  try {
    for (const args of [
      [0], [0, '0.0.0.0'], [0, '::'], [0, 'localhost'],
      [{ port: 0 }], [{ port: 0, host: '0.0.0.0' }],
      [{ port: 0, host: '::' }], [{ path: '/tmp/dadyar-preview-test.sock' }],
      [{ port: 0, host: '127.0.0.1', fd: 1 }],
      [{ port: 0, host: '127.0.0.1', exclusive: false }],
      [0, '127.0.0.2'], [-1, '127.0.0.1'], [65536, '127.0.0.1']
    ]) {
      assert.throws(() => server.listen(...args), /loopback/,
        'unsafe listen form must be rejected: ' + JSON.stringify(args));
      assert.equal(server.listening, false);
    }
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ port: 0, host: '127.0.0.1' }, resolve);
    });
    assert.equal(server.address().address, '127.0.0.1');
  } finally {
    if (server.listening) await new Promise((resolve, reject) =>
      server.close(err => err ? reject(err) : resolve()));
  }
});
