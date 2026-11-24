'use strict';
// Synthetic-only HTTP regression: local development service must not be
// reachable through a forged Host, mismatched Origin, or cross-site fetch.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../backend/server');

function request(port, { method = 'GET', route = '/health', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: route, method,
      headers: { Host: '127.0.0.1:' + port, ...headers },
      timeout: 4000,
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

test('loopback service rejects forged Host, mismatched Origin and cross-site POST', async () => {
  const server = createServer({ rateLimit: { max: 50, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const host = '127.0.0.1:' + port;
    const valid = await request(port, { headers: { Origin: 'http://' + host } });
    assert.equal(valid.status, 200);
    assert.equal(valid.headers['access-control-allow-origin'], undefined);
    const rejected = [
      { Host: 'example.invalid:' + port },
      { Host: '127.0.0.1:1' },
      { Origin: 'http://example.invalid' },
      { Host: 'localhost:' + port, Origin: 'http://' + host },
    ];
    for (const headers of rejected) {
      const res = await request(port, { headers });
      assert.equal(res.status, 403, JSON.stringify(headers));
      assert.deepEqual(JSON.parse(res.body), { error: 'local_origin_required' });
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    }
    const sameHost = await request(port, {
      headers: { Host: 'localhost:' + port, Origin: 'http://localhost:' + port },
    });
    assert.equal(sameHost.status, 200);
    const secretMarker = 'SYNTHETIC_NEVER_REFLECT';
    const payload = JSON.stringify({
      topic: 'fraud', role: 'شاهد', story: 'شرح ساختگی ' + secretMarker,
      answers: ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم'],
    });
    const post = {
      method: 'POST', route: '/api/cases/validate', body: payload,
      headers: { Origin: 'http://' + host, 'Content-Type': 'application/json' },
    };
    const crossSite = await request(port, {
      ...post, headers: { ...post.headers, 'Sec-Fetch-Site': 'cross-site' },
    });
    assert.equal(crossSite.status, 403);
    assert.deepEqual(JSON.parse(crossSite.body), { error: 'same_origin_required' });
    assert.equal(crossSite.body.includes(secretMarker), false);
    const sameOrigin = await request(port, {
      ...post, headers: { ...post.headers, 'Sec-Fetch-Site': 'same-origin' },
    });
    assert.equal(sameOrigin.status, 200);
    assert.deepEqual(JSON.parse(sameOrigin.body), { valid: true, errors: [] });
    assert.equal(sameOrigin.body.includes(secretMarker), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
