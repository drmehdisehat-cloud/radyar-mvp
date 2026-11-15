'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  DEFAULT_ROUTE_PATH,
  createReviewReleaseHttpHandler,
  createReviewReleaseHttpServer
} = require('../backend/review-release-http-handler.cjs');

const ORIGIN = 'https://preview.example.test';
const REPORT = Buffer.from('گزارش ساختگی چک؛ فقط برای آزمون. بدون اثر حقوقی.', 'utf8');
const SESSION = 'synthetic-reviewer-session';

function fixture(options = {}) {
  let gateCalls = 0;
  const handler = createReviewReleaseHttpHandler({
    allowedOrigin: ORIGIN,
    maxBodyBytes: 2048,
    maxReportBytes: 4096,
    releaseReviewedReport: async ({ request, envelope }) => {
      gateCalls += 1;
      if (request.headers['x-test-session'] !== SESSION) {
        throw new Error('authenticated reviewer principal required');
      }
      if (!envelope || envelope.decision !== 'approved' || envelope.synthetic !== true) {
        throw new Error('review approval is invalid');
      }
      return { reportBytes: REPORT };
    },
    ...options
  });
  return { handler, get gateCalls() { return gateCalls; } };
}

async function withServer(handler, callback) {
  const server = createReviewReleaseHttpServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = 'http://127.0.0.1:' + address.port + DEFAULT_ROUTE_PATH;
  try {
    await callback(url, server);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function headers(overrides = {}) {
  return {
    Origin: ORIGIN,
    'Content-Type': 'application/json; charset=utf-8',
    'Sec-Fetch-Site': 'same-origin',
    'X-Test-Session': SESSION,
    ...overrides
  };
}

function body(envelope = { decision: 'approved', synthetic: true }) {
  return JSON.stringify({ envelope });
}

async function post(url, payload = body(), overrides = {}) {
  return fetch(url, {
    method: 'POST',
    headers: headers(overrides),
    body: payload
  });
}

function rawRequest(url, method, headerPairs, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request({
      hostname: target.hostname,
      port: Number(target.port),
      path: target.pathname,
      method,
      headers: headerPairs
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    request.on('error', reject);
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}

function rawHeaderPairs(overrides = []) {
  return [
    'Origin', ORIGIN,
    'Content-Type', 'application/json; charset=utf-8',
    'Sec-Fetch-Site', 'same-origin',
    'X-Test-Session', SESSION,
    ...overrides
  ];
}

test('serves only server-loaded bytes after the injected review gate approves', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, body(), { 'X-Reviewer-Id': 'caller-controlled-id' });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), REPORT);
    assert.match(response.headers.get('content-disposition'), /attachment; filename="dadyar-reviewed-report\.txt"/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(f.gateCalls, 1);
  });
});

test('does not release a report when the server-side session adapter rejects the reviewer', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, body(), { 'X-Test-Session': 'missing-session' });
    assert.equal(response.status, 401);
    assert.equal(await response.text(), 'نشست بازبین معتبر نیست.');
    assert.equal(f.gateCalls, 1);
  });
});

test('does not release a report when the review decision is rejected', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, body({ decision: 'rejected', synthetic: true }));
    assert.equal(response.status, 403);
    assert.equal(f.gateCalls, 1);
  });
});

test('rejects cross-origin requests before invoking the review gate', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, body(), { Origin: 'https://attacker.example' });
    assert.equal(response.status, 403);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects cross-site Fetch Metadata before invoking the review gate', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, body(), { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(response.status, 403);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects methods other than POST and returns an explicit Allow header', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await fetch(url, { method: 'GET' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects query, encoded and path-normalization aliases without reaching the gate', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    for (const suffix of ['?download=1', '%2fapi/dadyar/review-report', '/../api/dadyar/review-report']) {
      const response = await fetch(url.replace(DEFAULT_ROUTE_PATH, DEFAULT_ROUTE_PATH + suffix), {
        method: 'POST',
        headers: headers(),
        body: body(),
        redirect: 'manual'
      });
      assert.ok([400, 404].includes(response.status), 'unexpected status for ' + suffix);
    }
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects duplicate Origin headers at the raw HTTP boundary', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const result = await rawRequest(url, 'POST', rawHeaderPairs(['Origin', ORIGIN]), body());
    assert.equal(result.status, 400);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects duplicate JSON keys instead of accepting parser-dependent values', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, '{"envelope":{"decision":"approved","decision":"rejected","synthetic":true}}');
    assert.equal(response.status, 400);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects malformed UTF-8 before JSON parsing', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const bytes = Buffer.from([0x7b, 0x22, 0x65, 0x6e, 0x76, 0x65, 0x6c, 0x6f, 0x70, 0x65, 0x22, 0x3a, 0xff, 0x7d]);
    const target = new URL(url);
    const result = await rawRequest(url, 'POST', rawHeaderPairs([
      'Content-Length', String(bytes.length)
    ]), bytes);
    assert.equal(result.status, 400);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects compressed request bodies', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, body(), { 'Content-Encoding': 'gzip' });
    assert.equal(response.status, 415);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects an oversized request before invoking the review gate', async () => {
  const f = fixture({ maxBodyBytes: 1024 });
  await withServer(f.handler, async url => {
    const response = await post(url, JSON.stringify({ envelope: { decision: 'approved', synthetic: true, padding: 'x'.repeat(1500) } }));
    assert.equal(response.status, 413);
    assert.equal(f.gateCalls, 0);
  });
});

test('fails closed when the gate cannot load a bounded report', async () => {
  const f = fixture({
    maxReportBytes: 32,
    releaseReviewedReport: async () => ({ reportBytes: Buffer.alloc(33, 0x61) })
  });
  await withServer(f.handler, async url => {
    const response = await post(url);
    assert.equal(response.status, 503);
    assert.equal(f.gateCalls, 0);
  });
});

test('server factory applies bounded HTTP parser and timeout settings', () => {
  const f = fixture();
  const server = createReviewReleaseHttpServer(f.handler);
  try {
    assert.equal(server.maxHeadersCount, 64);
    assert.equal(server.requestTimeout, 15000);
    assert.equal(server.headersTimeout, 5000);
    assert.equal(server.keepAliveTimeout, 5000);
  } finally {
    server.close();
  }
});

test('rejects non-canonical or non-HTTPS origins at configuration time', () => {
  assert.throws(() => createReviewReleaseHttpHandler({
    allowedOrigin: 'http://preview.example.test',
    releaseReviewedReport: async () => ({ reportBytes: REPORT })
  }), /canonical HTTPS origin/);
  assert.throws(() => createReviewReleaseHttpHandler({
    allowedOrigin: 'https://preview.example.test/path',
    releaseReviewedReport: async () => ({ reportBytes: REPORT })
  }), /canonical HTTPS origin/);
});
