'use strict';
// Synthetic-only regression: a preview credential must not be accepted when
// the request also carries proxy authentication. This verifier is not wired
// into the development API and is NOT authorization to deploy a preview.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { verifyPreviewBearer } = require('../backend/preview-auth');

const token = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64url');
const bearer = 'Bearer ' + token;

test('preview verifier rejects mixed end-user and proxy credentials', () => {
  for (const name of ['Proxy-Authorization', 'proxy-authorization', 'PROXY-AUTHORIZATION']) {
    assert.equal(verifyPreviewBearer({ url: '/preview', rawHeaders: [
      'Host', 'localhost', 'Authorization', bearer, name, 'Basic synthetic'
    ] }, token), false, 'proxy credential must deny regardless of header casing');
  }
  assert.equal(verifyPreviewBearer({ url: '/preview', rawHeaders: [
    'Authorization', bearer, 'X-Request-Id', 'synthetic'
  ] }, token), true, 'ordinary unrelated headers remain allowed');
});

test('real loopback HTTP parser preserves proxy credential for fail-closed denial', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(verifyPreviewBearer(req, token) ? 204 : 401,
      { 'Cache-Control': 'no-store' });
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port, method: 'GET',
        headers: ['Host', '127.0.0.1:' + port,
          'Authorization', bearer,
          'Proxy-Authorization', 'Basic synthetic']
      }, res => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, cache: res.headers['cache-control'] }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(response.status, 401);
    assert.equal(response.cache, 'no-store');
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
