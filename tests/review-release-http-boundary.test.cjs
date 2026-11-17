'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
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
  const { allowedOrigin: configuredOrigin, ...handlerOptions } = options;
  const createHandler = (allowedOrigin = configuredOrigin || ORIGIN) => createReviewReleaseHttpHandler({
    allowedOrigin,
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
    ...handlerOptions
  });
  return { createHandler, get gateCalls() { return gateCalls; } };
}

async function withServer(fixtureValue, callback) {
  const server = createReviewReleaseHttpServer(() => {});
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const allowedOrigin = 'https://127.0.0.1:' + address.port;
  server.on('request', fixtureValue.createHandler(allowedOrigin));
  const url = 'http://127.0.0.1:' + address.port + DEFAULT_ROUTE_PATH;
  try {
    await callback(url, server, allowedOrigin);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function headers(url, overrides = {}) {
  const target = new URL(url);
  return {
    Origin: 'https://' + target.host,
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
    headers: headers(url, overrides),
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

function rawHeaderPairs(url, overrides = []) {
  const target = new URL(url);
  return [
    'Origin', 'https://' + target.host,
    'Content-Type', 'application/json; charset=utf-8',
    'Sec-Fetch-Site', 'same-origin',
    'X-Test-Session', SESSION,
    ...overrides
  ];
}

test('serves only server-loaded bytes after the injected review gate approves', async () => {
  const f = fixture();
  await withServer(f, async url => {
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
  await withServer(f, async url => {
    const response = await post(url, body(), { 'X-Test-Session': 'missing-session' });
    assert.equal(response.status, 401);
    assert.equal(await response.text(), 'نشست بازبین معتبر نیست.');
    assert.equal(f.gateCalls, 1);
  });
});

test('does not release a report when the review decision is rejected', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const response = await post(url, body({ decision: 'rejected', synthetic: true }));
    assert.equal(response.status, 403);
    assert.equal(f.gateCalls, 1);
  });
});


test('rejects a Host header that does not match the configured HTTPS origin before invoking the review gate', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const result = await rawRequest(url, 'POST', rawHeaderPairs(url, [
      'Host', 'attacker.example'
    ]), body());
    assert.equal(result.status, 421);
    assert.equal(f.gateCalls, 0);
    assert.equal(result.headers['cache-control'], 'no-store, private, max-age=0');
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
  });
});

test('rejects cross-origin requests before invoking the review gate', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const response = await post(url, body(), { Origin: 'https://attacker.example' });
    assert.equal(response.status, 403);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects cross-site Fetch Metadata before invoking the review gate', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const response = await post(url, body(), { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(response.status, 403);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects methods other than POST and returns an explicit Allow header', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const response = await fetch(url, { method: 'GET' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects query, encoded and path-normalization aliases without reaching the gate', async () => {
  const f = fixture();
  await withServer(f, async url => {
    for (const suffix of ['?download=1', '%2fapi/dadyar/review-report', '/../api/dadyar/review-report']) {
      const response = await fetch(url.replace(DEFAULT_ROUTE_PATH, DEFAULT_ROUTE_PATH + suffix), {
        method: 'POST',
        headers: headers(url),
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
  await withServer(f, async url => {
    const result = await rawRequest(url, 'POST', rawHeaderPairs(url, ['Origin', 'https://attacker.example']), body());
    assert.equal(result.status, 400);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects duplicate Host, Cookie, Authorization and Fetch Metadata headers before the review gate', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const target = new URL(url);
    const cases = [
      ['Host', [target.host, 'attacker.example']],
      ['Cookie', ['reviewer=session-a', 'reviewer=session-b']],
      ['Authorization', ['Bearer synthetic-a', 'Bearer synthetic-b']],
      ['Sec-Fetch-Site', ['same-origin', 'cross-site']]
    ];

    for (const [name, values] of cases) {
      const pairs = rawHeaderPairs(url);
      if (name === 'Host') {
        pairs.unshift('Host', values[0], 'Host', values[1]);
      } else {
        pairs.push(name, values[0], name, values[1]);
      }
      const result = await rawRequest(url, 'POST', pairs, body());
      assert.equal(result.status, 400, 'duplicate ' + name + ' must be rejected');
      assert.equal(result.headers.connection, 'close');
    }
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects duplicate JSON keys instead of accepting parser-dependent values', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const response = await post(url, '{"envelope":{"decision":"approved","decision":"rejected","synthetic":true}}');
    assert.equal(response.status, 400);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects malformed UTF-8 before JSON parsing', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const bytes = Buffer.from([0x7b, 0x22, 0x65, 0x6e, 0x76, 0x65, 0x6c, 0x6f, 0x70, 0x65, 0x22, 0x3a, 0xff, 0x7d]);
    const target = new URL(url);
    const result = await rawRequest(url, 'POST', rawHeaderPairs(url, [
      'Content-Length', String(bytes.length)
    ]), bytes);
    assert.equal(result.status, 400);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects compressed request bodies', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const response = await post(url, body(), { 'Content-Encoding': 'gzip' });
    assert.equal(response.status, 415);
    assert.equal(f.gateCalls, 0);
  });
});

test('rejects an oversized request before invoking the review gate', async () => {
  const f = fixture({ maxBodyBytes: 1024 });
  await withServer(f, async url => {
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
  await withServer(f, async url => {
    const response = await post(url);
    assert.equal(response.status, 503);
    assert.equal(f.gateCalls, 0);
  });
});

test('server factory applies bounded HTTP parser and timeout settings', () => {
  const f = fixture();
  const server = createReviewReleaseHttpServer(f.createHandler());
  assert.equal(server.maxHeadersCount, 64);
  assert.equal(server.requestTimeout, 15000);
  assert.equal(server.headersTimeout, 5000);
  assert.equal(server.keepAliveTimeout, 5000);
});

test('server factory refuses wildcard, omitted-host, Unix-socket and pre-bound listeners', () => {
  const server = createReviewReleaseHttpServer((_request, response) => response.end());
  const error = /explicit loopback TCP listener/;
  assert.throws(() => server.listen(8787, '0.0.0.0'), error);
  assert.throws(() => server.listen(8787, '::'), error);
  assert.throws(() => server.listen(8787), error);
  assert.throws(() => server.listen({ port: 8787 }), error);
  assert.throws(() => server.listen({ path: '/tmp/dadyar-review.sock', host: '127.0.0.1' }), error);
  assert.throws(() => server.listen({ fd: 3, port: 8787, host: '127.0.0.1' }), error);
});

test('server facade hides the native prototype escape hatch and protects expectation guards', () => {
  const server = createReviewReleaseHttpServer(() => {});
  assert.equal(Object.getPrototypeOf(server), null);
  assert.equal(Object.isFrozen(server), true);
  assert.throws(() => http.Server.prototype.listen.call(server, 8787, '0.0.0.0'));
  assert.equal(server.listening, false);
  assert.throws(() => server.on('checkContinue', () => {}), /event is not exposed/);
  assert.throws(() => server.once('checkExpectation', () => {}), /event is not exposed/);
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

test('rejects Expect: 100-continue before accepting report bytes or invoking the review gate', async () => {
  const f = fixture();
  await withServer(f, async url => {
    const target = new URL(url);
    const payload = body();
    const rawResponse = await new Promise((resolve, reject) => {
      const socket = net.connect(Number(target.port), target.hostname);
      let response = '';
      socket.setEncoding('latin1');
      socket.setTimeout(3000, () => socket.destroy(new Error('timed out waiting for expectation rejection')));
      socket.once('connect', () => {
        socket.end([
          'POST ' + DEFAULT_ROUTE_PATH + ' HTTP/1.1',
          'Host: ' + target.host,
          'Origin: https://' + target.host,
          'Content-Type: application/json; charset=utf-8',
          'Sec-Fetch-Site: same-origin',
          'X-Test-Session: ' + SESSION,
          'Expect: 100-continue',
          'Content-Length: ' + Buffer.byteLength(payload),
          'Connection: close',
          '',
          ''
        ].join('\r\n'));
      });
      socket.on('data', chunk => { response += chunk; });
      socket.once('end', () => resolve(response));
      socket.once('error', reject);
    });

    assert.match(rawResponse.split('\r\n', 1)[0], /^HTTP\/1\.1 417 /);
    assert.doesNotMatch(rawResponse, /^HTTP\/1\.1 100 Continue/m);
    assert.match(rawResponse, /Connection: close/i);
    assert.match(rawResponse, /Cache-Control: no-store, private, max-age=0/i);
    assert.equal(f.gateCalls, 0);
  });
});
