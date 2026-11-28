'use strict';
// Synthetic-only loopback tests. The gate is NOT wired into backend/server.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createPreviewGate } = require('../backend/preview-gate');

const token = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64url');
const wrong = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 2)).toString('base64url');

async function withServer(run) {
  let downstreamCalls = 0;
  const server = http.createServer(createPreviewGate(token, (_req, res) => {
    downstreamCalls++;
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(server.address().port, () => downstreamCalls); }
  finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}
function request(port, headers, path = '/', method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method,
      headers: ['Host', '127.0.0.1:' + port, ...headers] }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('preview gate denies unauthorized routes before downstream handlers', async () => {
  await withServer(async (port, calls) => {
    for (const [headers, path, method, body] of [
      [[], '/', 'GET'],
      [['Authorization', 'Bearer ' + wrong], '/health', 'GET'],
      [['Cookie', 'preview=' + token], '/', 'GET'],
      [['Authorization', 'Bearer ' + token], '/?token=redacted', 'GET'],
      [['Authorization', 'Bearer ' + token, 'Authorization', 'Bearer ' + token], '/', 'GET'],
      [[], '/api/cases/validate', 'POST', '{"fictional":true}'],
    ]) {
      const response = await request(port, headers, path, method, body);
      assert.equal(response.status, 401);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['content-length'], '0');
      assert.equal(response.headers['referrer-policy'], 'no-referrer');
      assert.equal(response.body, '');
      assert.equal(calls(), 0, 'unauthorized requests must not reach the application');
    }
    const ok = await request(port, ['Authorization', 'Bearer ' + token]);
    assert.equal(ok.status, 204);
    assert.equal(calls(), 1);
  });
});

test('preview gate rejects invalid setup and missing configured credential', async () => {
  assert.throws(() => createPreviewGate(token, null), TypeError);
  let called = false;
  const gate = createPreviewGate(undefined, () => { called = true; });
  const response = { writeHead(code) { assert.equal(code, 401); }, end() {} };
  gate({ url: '/', rawHeaders: ['Authorization', 'Bearer ' + token] }, response);
  assert.equal(called, false);
});
