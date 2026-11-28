'use strict';
// Live loopback HTTP regression with synthetic-only data.
// An unauthenticated local prototype must not acknowledge an upload before
// checking whether it even accepts Expect: 100-continue.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../backend/server');

test('local API rejects Expect: 100-continue before inviting any request body', async () => {
  const server = createServer({ rateLimit: { max: 100, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    let continued = false;
    const result = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port, method: 'POST', path: '/api/cases/validate',
        headers: {
          Host: '127.0.0.1:' + port,
          Expect: '100-continue',
          'Content-Type': 'application/json',
          'Content-Length': 100_000,
        },
      }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.setTimeout(3000, () => req.destroy(new Error('Expect handshake timeout')));
      req.on('continue', () => {
        continued = true;
        req.end('synthetic only');
      });
      req.on('error', reject);
      // Do not send a request body unless the server explicitly invites one.
      req.flushHeaders();
    });
    assert.equal(continued, false, 'server must not send HTTP 100 Continue');
    assert.equal(result.status, 417);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers.connection, 'close');
    assert.deepEqual(JSON.parse(result.body), { error: 'expectation_not_supported' });

    // Hardening must not break ordinary synthetic local validation.
    const response = await fetch('http://127.0.0.1:' + port + '/api/cases/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'check', role: 'شاهد',
        story: 'شرح ساختگی جهت آزمون درخواست عادی',
        answers: ['پاسخ یک', 'پاسخ دو', 'پاسخ سه', 'پاسخ چهار', 'پاسخ پنج'],
      }),
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { valid: true, errors: [] });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
