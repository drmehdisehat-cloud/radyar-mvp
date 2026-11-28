'use strict';

// The signed-review HTTP adapter is intentionally not deployed. Exercise the
// actual development server over loopback so an accidental route/method alias
// cannot silently expose it before identity and release gates are approved.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../backend/server');

function request(port, method, path) {
  return new Promise((resolve, reject) => {
    const body = method === 'POST'
      ? JSON.stringify({ envelope: { decision: 'approved', synthetic: true } })
      : undefined;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      agent: false,
      headers: body ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      } : {}
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    if (body) req.end(body);
    else req.end();
  });
}

test('review-report adapter stays absent for methods and path aliases on the dev server', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const server = createServer();

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    const paths = [
      '/api/dadyar/review-report',
      '/api/dadyar/review-report/',
      '/api/dadyar/review-report?download=1',
      '/api/dadyar/%72eview-report'
    ];

    for (const path of paths) {
      for (const method of methods) {
        const response = await request(port, method, path);
        assert.equal(response.status, 404, method + ' ' + path + ' must remain unmounted');
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(response.headers['x-content-type-options'], 'nosniff');
        assert.equal(response.headers['access-control-allow-origin'], undefined);
      }
    }
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('development server does not import or mount the signed-review adapter', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');
  assert.doesNotMatch(source, /require\(['"]\.\/review-release-http-handler\.cjs['"]\)/);
  assert.doesNotMatch(source, /createReviewReleaseHttpHandler/);
});
