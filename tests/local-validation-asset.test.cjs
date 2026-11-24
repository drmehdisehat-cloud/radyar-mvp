'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createServer } = require('../backend/server');

// Synthetic-only: verify the local opt-in client is available without exposing it cross-origin.
test('local validation client is served same-origin with restrictive headers', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api-validation.js'), 'utf8');
  assert.match(source, /credentials: 'omit'/);
  assert.match(source, /confirm\(/);
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const base = `http://127.0.0.1:${port}`;
    const response = await fetch(base + '/api-validation.js');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/javascript/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal(await response.text(), source);
    const denied = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/api-validation.js',
        headers: { host: 'attacker.invalid' } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      }).on('error', reject);
    });
    assert.equal(denied, 403);
    assert.equal((await fetch(base + '/.env')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
