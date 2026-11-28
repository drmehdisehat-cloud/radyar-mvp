'use strict';
// Synthetic-only real HTTP regression. Not a deployable preview server.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createPreviewTestServer } = require('../backend/preview-http');
const token = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64url');

function request(port, expectValue, authorization) {
  return new Promise((resolve, reject) => {
    let interim = false;
    const req = http.request({ hostname: '127.0.0.1', port, method: 'POST', path: '/api/cases/validate',
      headers: { Expect: expectValue, ...(authorization ? { Authorization: authorization } : {}), 'Content-Length': '100' } }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, interim }));
    });
    req.on('continue', () => { interim = true; });
    req.on('error', reject);
    req.flushHeaders();
  });
}

test('preview test server denies Expect handshakes before accepting a body', async () => {
  let downstream = 0;
  const server = createPreviewTestServer(token, (_req, res) => { downstream++; res.end('should-not-run'); });
  assert.throws(() => server.listen(0, '0.0.0.0'), /loopback/);
  assert.throws(() => server.listen(0), /loopback/);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const authorization of [undefined, 'Bearer ' + token]) {
      for (const expectValue of ['100-continue', 'unsupported']) {
        const res = await request(server.address().port, expectValue, authorization);
        assert.equal(res.status, 417);
        assert.equal(res.interim, false, 'must never send 100 Continue');
        assert.equal(res.headers['cache-control'], 'no-store');
        assert.equal(res.headers['content-length'], '0');
        assert.equal(res.headers.connection, 'close');
      }
    }
    assert.equal(downstream, 0);
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
