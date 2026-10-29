'use strict';
// Synthetic-only loopback HTTP regression. Alternate proxy client-address
// markers must not be mistaken for a direct local browser request.
// This is defense in depth, not authentication or a public deployment test.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../backend/server');

function request(port, header, value) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/health', method: 'GET',
      headers: { Host: '127.0.0.1:' + port, [header]: value },
      timeout: 4000,
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.end();
  });
}

test('local-only API rejects alternate reverse-proxy client-address markers', async () => {
  const server = createServer({ rateLimit: { max: 100, windowMs: 60000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const direct = await request(port, 'Accept', 'application/json');
    assert.equal(direct.status, 200);
    for (const header of [
      'Proxy-Connection', 'X-Client-IP', 'X-Cluster-Client-IP',
      'X-Envoy-External-Address', 'CF-Connecting-IP',
      'True-Client-IP', 'Fastly-Client-IP',
    ]) {
      const denied = await request(port, header, '198.51.100.8');
      assert.equal(denied.status, 403, header);
      assert.equal(denied.headers['cache-control'], 'no-store', header);
      assert.deepEqual(JSON.parse(denied.body), { error: 'local_origin_required' }, header);
      assert.equal(denied.headers['access-control-allow-origin'], undefined, header);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
