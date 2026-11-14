'use strict';
// Live loopback-only HTTP regression. No client data or real case details.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../backend/server');

function requestWithUnsupportedExpectation(port, method, path) {
  return new Promise((resolve, reject) => {
    let interim = false;
    const req = http.request({
      hostname: '127.0.0.1', port, method, path,
      headers: {
        Host: '127.0.0.1:' + port,
        Expect: 'x-dadyar-unsupported',
        ...(method === 'POST' ? { 'Content-Length': 100000 } : {}),
      },
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ interim, status: res.statusCode, headers: res.headers, body }));
    });
    req.on('continue', () => { interim = true; });
    req.on('information', () => { interim = true; });
    req.setTimeout(3000, () => req.destroy(new Error('Unsupported Expect handshake timeout')));
    req.on('error', reject);
    // Send only headers; never transmit a synthetic case body.
    req.flushHeaders();
  });
}

test('unsupported Expect values are rejected with privacy headers before body upload', async () => {
  const server = createServer({ rateLimit: { max: 100, windowMs: 60000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    for (const [method, path] of [['POST', '/api/cases/validate'], ['GET', '/health']]) {
      const response = await requestWithUnsupportedExpectation(port, method, path);
      assert.equal(response.interim, false, method + ' must not receive 1xx');
      assert.equal(response.status, 417, method);
      assert.equal(response.headers['cache-control'], 'no-store', method);
      assert.equal(response.headers['x-content-type-options'], 'nosniff', method);
      assert.equal(response.headers.connection, 'close', method);
      assert.deepEqual(JSON.parse(response.body), { error: 'expectation_not_supported' }, method);
    }
    const health = await fetch('http://127.0.0.1:' + port + '/health', {
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(health.status, 200, 'ordinary direct loopback requests still work');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
