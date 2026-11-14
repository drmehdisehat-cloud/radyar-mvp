'use strict';
// Synthetic-only regression for the isolated preview verifier.
// This module is not connected to the development API and must not be deployed.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { verifyPreviewBearer } = require('../backend/preview-auth');

const token = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64url');
const bearer = 'Bearer ' + token;

test('preview bearer refuses mixed cookie or URL credential transports', () => {
  for (const cookieName of ['Cookie', 'cookie', 'COOKIE']) {
    assert.equal(verifyPreviewBearer({ url: '/preview', rawHeaders: [
      'Authorization', bearer, cookieName, 'session=synthetic'
    ] }, token), false);
  }
  for (const path of ['/?access_token=synthetic', '/preview?view=summary', '/preview#fragment',
    'http://localhost/preview']) {
    assert.equal(verifyPreviewBearer({ url: path, rawHeaders: [
      'Authorization', bearer
    ] }, token), false, 'query, fragment and absolute request targets are forbidden');
  }
  assert.equal(verifyPreviewBearer({ url: '/preview', rawHeaders: [
    'Authorization', bearer, 'X-Request-Id', 'synthetic'
  ] }, token), true);
});

test('real loopback HTTP rejects a correct bearer mixed with cookie or query', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(verifyPreviewBearer(req, token) ? 204 : 401,
      { 'Cache-Control': 'no-store' });
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    async function probe(path, extraHeaders) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1', port, path,
          headers: { Authorization: bearer, ...extraHeaders }
        }, res => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode,
            cache: res.headers['cache-control'] }));
        });
        req.on('error', reject);
        req.end();
      });
    }
    for (const [path, headers, expected] of [
      ['/preview', {}, 204],
      ['/preview', { Cookie: 'session=synthetic' }, 401],
      ['/preview?view=summary', {}, 401]
    ]) {
      const response = await probe(path, headers);
      assert.equal(response.status, expected, 'credential transport boundary');
      assert.equal(response.cache, 'no-store');
    }
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
