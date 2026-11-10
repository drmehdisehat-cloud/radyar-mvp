'use strict';
// Local HTTP contract for the exact shared-host subpath.
// This is a CI fixture only; it does not prove that cPanel serves the live site.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

const htmlPath = path.resolve(__dirname, '..', 'dadyar-preview', 'index.html');
const html = fs.readFileSync(htmlPath);
const contentSecurityPolicy = [
  "default-src 'none'",
  "connect-src 'none'",
  "img-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "form-action 'none'",
  "base-uri 'none'"
].join('; ');

function createServer() {
  return http.createServer((req, res) => {
    const rawPath = String(req.url || '').split('?')[0];
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Allow': 'GET, HEAD', 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    // Exact allow-list avoids traversal, encoded separators and accidental root exposure.
    if (rawPath !== '/dadyar-preview/' && rawPath !== '/dadyar-preview/index.html') {
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': String(html.length),
      'Cache-Control': 'no-store',
      'Content-Security-Policy': contentSecurityPolicy,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Resource-Policy': 'same-origin'
    });
    res.end(req.method === 'HEAD' ? undefined : html);
  });
}

test('offline Dadyar preview is served at the exact /dadyar-preview/ subpath', async (t) => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  for (const route of ['/dadyar-preview/', '/dadyar-preview/index.html']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-security-policy'), contentSecurityPolicy);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('location'), null);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), html);
  }
});

test('subpath server refuses root, traversal, encoded separators and non-GET methods', async (t) => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const route of [
    '/',
    '/index.html',
    '/dadyar-preview/../index.html',
    '/dadyar-preview/%2e%2e/index.html',
    '/dadyar-preview/%2f..%2findex.html',
    '/%64adyar-preview/'
  ]) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 404, route);
    assert.equal(response.headers.get('location'), null);
  }

  const post = await fetch(base + '/dadyar-preview/', { method: 'POST', body: 'synthetic-only' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('subpath HEAD response is bodyless and preserves the exact HTML length', async (t) => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/dadyar-preview/`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(html.length));
  assert.equal(await response.text(), '');
});
