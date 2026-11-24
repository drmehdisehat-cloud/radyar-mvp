'use strict';
// Synthetic-only listener regression: an imported dev API must not bind to
// public interfaces, Unix sockets, pre-bound handles or implicit hosts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../backend/server');

test('development API rejects non-loopback and ambiguous listener signatures', () => {
  const rejected = [
    [0], [0, '0.0.0.0'], [0, '::'], [0, 'localhost'],
    [0, '127.0.0.2'], ['0', '127.0.0.1'],
    [{ port: 0, host: '0.0.0.0' }],
    [{ port: 0, host: '127.0.0.1', fd: 1 }],
    [{ path: '/tmp/dadyar-must-not-create.sock' }],
  ];
  for (const args of rejected) {
    const server = createServer();
    assert.throws(() => server.listen(...args), /explicit loopback TCP listener/,
      'unsafe listen signature: ' + JSON.stringify(args));
    assert.equal(server.listening, false);
  }
});

test('development API still accepts explicit IPv4 loopback TCP listeners', async () => {
  for (const args of [[0, '127.0.0.1'], [{ port: 0, host: '127.0.0.1' }]]) {
    const server = createServer();
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(...args, resolve);
      });
      assert.equal(server.address().address, '127.0.0.1');
      assert.ok(server.address().port > 0);
    } finally {
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
  }
});
