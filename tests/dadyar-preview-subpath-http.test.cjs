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
const htmlText = html.toString('utf8');
const cspMatch = htmlText.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i);
assert.ok(cspMatch, 'preview must declare its committed CSP meta policy');
const contentSecurityPolicy = cspMatch[1];
const responseContentSecurityPolicy = contentSecurityPolicy + "; frame-ancestors 'none'";
assert.doesNotMatch(contentSecurityPolicy, /'unsafe-inline'/i,
  'HTTP fixture must not weaken the hash-only inline policy');
assert.match(contentSecurityPolicy, /connect-src 'none'/);
assert.match(contentSecurityPolicy, /form-action 'none'/);
assert.match(contentSecurityPolicy, /base-uri 'none'/);

function createServer() {
  return http.createServer((req, res) => {
    const rawPath = String(req.url || '').split('?')[0];
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.resume();
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
      // Mirror the actual reviewed HTML policy; never substitute unsafe-inline in CI.
      'Content-Security-Policy': responseContentSecurityPolicy,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Resource-Policy': 'same-origin'
    });
    res.end(req.method === 'HEAD' ? undefined : html);
  });
}

function requestRaw(address, method, requestPath, body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      method,
      path: requestPath
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address();
}

function closeAfter(server, t) {
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
}

test('offline Dadyar preview is served at the exact /dadyar-preview/ subpath with the reviewed CSP', async (t) => {
  const server = createServer();
  const address = await listen(server);
  closeAfter(server, t);
  const base = `http://127.0.0.1:${address.port}`;

  for (const route of ['/dadyar-preview/', '/dadyar-preview/index.html']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-security-policy'), responseContentSecurityPolicy);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.doesNotMatch(response.headers.get('content-security-policy'), /'unsafe-inline'/i);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('location'), null);
    const body = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(body, html);
    const page = body.toString('utf8');
    assert.match(page, /http-equiv="Content-Security-Policy"/);
    assert.match(page, /connect-src 'none'/);
  }
});

test('subpath server refuses raw traversal, encoded separators and non-GET methods', async (t) => {
  const server = createServer();
  const address = await listen(server);
  closeAfter(server, t);

  for (const route of [
    '/',
    '/index.html',
    '/dadyar-preview/../index.html',
    '/dadyar-preview/%2e%2e/index.html',
    '/dadyar-preview/%2f..%2findex.html',
    '/%64adyar-preview/'
  ]) {
    // http.request preserves the raw request target; fetch/URL would normalize dot segments.
    const response = await requestRaw(address, 'GET', route);
    assert.equal(response.statusCode, 404, route);
    assert.equal(response.headers.location, undefined);
  }

  const post = await requestRaw(address, 'POST', '/dadyar-preview/', 'synthetic-only');
  assert.equal(post.statusCode, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});

test('subpath HEAD response is bodyless and preserves the exact HTML length', async (t) => {
  const server = createServer();
  const address = await listen(server);
  closeAfter(server, t);
  const response = await requestRaw(address, 'HEAD', '/dadyar-preview/');
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-length'], String(html.length));
  assert.equal(response.body.length, 0);
});
