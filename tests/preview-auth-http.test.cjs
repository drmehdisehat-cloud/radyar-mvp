'use strict';
// Real loopback HTTP parsing test for the isolated preview bearer verifier.
// This is NOT a staging server or authorization for deployment.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { verifyPreviewBearer } = require('../backend/preview-auth');

const token = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64url');
const wrong = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 2)).toString('base64url');

async function withLoopbackServer(run) {
  const server = http.createServer((req, res) => {
    const allowed = verifyPreviewBearer(req, token);
    res.writeHead(allowed ? 204 : 401, { 'Cache-Control': 'no-store' });
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(server.address().port); }
  finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}
function request(port, headers, path = '/') {
  return new Promise((resolve, reject) => {
    // When using Node's raw header array, Host must be explicitly included.
    const raw = ['Host', '127.0.0.1:' + port, ...headers];
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', headers: raw }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('real Node HTTP raw headers: accept only a single correct bearer credential', async () => {
  await withLoopbackServer(async port => {
    const valid = await request(port, ['Authorization', 'Bearer ' + token]);
    assert.equal(valid.status, 204);
    assert.equal(valid.headers['cache-control'], 'no-store');
    const cases = [
      [[], '/'],
      [['Authorization', 'Bearer ' + wrong], '/'],
      [['Authorization', 'Bearer ' + token, 'authorization', 'Bearer ' + token], '/'],
      [['Cookie', 'preview=' + token], '/'],
      [[], '/?access_token=' + token],
      [['Authorization', 'Bearer  ' + token], '/'],
    ];
    for (const [headers, path] of cases) {
      const denied = await request(port, headers, path);
      // Do not include token values or query strings in assertion diagnostics.
      assert.equal(denied.status, 401, 'expected rejection for synthetic credential variant');
      assert.equal(denied.headers['cache-control'], 'no-store');
      assert.equal(denied.body, '');
    }
  });
});
