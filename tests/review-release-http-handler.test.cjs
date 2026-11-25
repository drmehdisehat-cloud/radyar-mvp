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
const ENVELOPE = Object.freeze({
  schema: 'dadyar-review-envelope-v1',
  review_id: 'synthetic-review-01',
  nonce: 'synthetic-nonce-01'
});

function makeBody(value = { envelope: ENVELOPE }) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function send(port, options = {}) {
  const body = options.body === undefined ? makeBody() : Buffer.from(options.body);
  const headers = {
    host: 'preview.example.test',
    origin: ORIGIN,
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    connection: 'close',
    ...(options.headers || {})
  };
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      method: options.method || 'POST',
      path: options.path || DEFAULT_ROUTE_PATH,
      headers
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    request.once('error', reject);
    request.end(body);
  });
}

async function withServer(releaseReviewedReport, options, callback) {
  const handler = createReviewReleaseHttpHandler({
    allowedOrigin: ORIGIN,
    releaseReviewedReport,
    ...(options || {})
  });
  const server = createReviewReleaseHttpServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
    server.listen({ host: '127.0.0.1', port: 0 });
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address.port === 'number');
    return await callback(address.port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

test('serves only bytes returned by the injected reviewed-report gate and sets private download headers', async () => {
  let observed;
  const expected = Buffer.from('synthetic reviewed cheque report\n', 'utf8');
  await withServer(async context => {
    observed = {
      method: context.request.method,
      url: context.request.url,
      envelope: context.envelope
    };
    return { reportBytes: expected };
  }, {}, async port => {
    const response = await send(port);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, expected);
    assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
    assert.match(response.headers['cache-control'], /no-store/);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.equal(response.headers['content-disposition'], 'attachment; filename="dadyar-reviewed-report.txt"');
  });
  assert.deepEqual(observed, {
    method: 'POST',
    url: DEFAULT_ROUTE_PATH,
    envelope: ENVELOPE
  });
});

test('maps only stable authentication and attestation error codes and never leaks provider error prose', async () => {
  const cases = [
    ['AUTHENTICATED_REVIEWER_REQUIRED', 401],
    ['REVIEW_ATTESTATION_REJECTED', 403],
    ['SYNTHETIC_IDP_OUTAGE', 503]
  ];
  for (const [code, expectedStatus] of cases) {
    await withServer(async () => {
      const error = new Error('synthetic private provider detail must not reach the client');
      error.code = code;
      throw error;
    }, {}, async port => {
      const response = await send(port);
      assert.equal(response.status, expectedStatus);
      assert.doesNotMatch(response.body.toString('utf8'), /synthetic private provider detail/);
      assert.match(response.headers['cache-control'], /no-store/);
      assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
    });
  }
});

test('rejects wrong host, wrong origin, wrong path, wrong method and extra envelope fields before calling the gate', async () => {
  let calls = 0;
  const gate = async () => {
    calls += 1;
    return { reportBytes: Buffer.from('must not be released') };
  };
  await withServer(gate, {}, async port => {
    assert.equal((await send(port, { headers: { host: 'attacker.example.test' } })).status, 421);
    assert.equal((await send(port, { headers: { origin: 'https://attacker.example.test' } })).status, 403);
    assert.equal((await send(port, { path: DEFAULT_ROUTE_PATH + '/' })).status, 404);
    assert.equal((await send(port, { method: 'GET', body: Buffer.alloc(0) })).status, 405);
    assert.equal((await send(port, { body: makeBody({ envelope: ENVELOPE, reviewer: 'spoofed' }) })).status, 400);
  });
  assert.equal(calls, 0);
});

test('rejects duplicate JSON keys and unsupported content types before calling the gate', async () => {
  let calls = 0;
  await withServer(async () => {
    calls += 1;
    return { reportBytes: Buffer.from('must not be released') };
  }, {}, async port => {
    const duplicate = Buffer.from('{"envelope":{"review_id":"one","review_id":"two"}}');
    assert.equal((await send(port, { body: duplicate })).status, 400);
    assert.equal((await send(port, { headers: { 'content-type': 'text/plain' } })).status, 415);
  });
  assert.equal(calls, 0);
});

test('rejects oversized request bodies and invalid report payloads fail closed', async () => {
  await withServer(async () => ({ reportBytes: Buffer.from('ok') }), { maxBodyBytes: 1024 }, async port => {
    assert.equal((await send(port, { body: Buffer.alloc(1100, 0x61) })).status, 413);
  });
  await withServer(async () => ({ reportBytes: 'not a byte buffer' }), {}, async port => {
    const response = await send(port);
    assert.equal(response.status, 503);
    assert.match(response.body.toString('utf8'), /گزارش در مخزن امن/);
  });
});

test('server facade refuses public listeners and request-dispatch mutation', () => {
  const handler = createReviewReleaseHttpHandler({
    allowedOrigin: ORIGIN,
    releaseReviewedReport: async () => ({ reportBytes: Buffer.from('synthetic') })
  });
  const server = createReviewReleaseHttpServer(handler);
  assert.throws(() => server.listen(0), /explicit loopback TCP listener/);
  assert.throws(() => server.listen({ host: '0.0.0.0', port: 0 }), /explicit loopback TCP listener/);
  assert.throws(() => server.on('request', () => {}), /event is not exposed/);
  assert.throws(() => server.once('request', () => {}), /event is not exposed/);
});

test('rejects caller-supplied reviewer identity headers before invoking the trusted release gate', async () => {
  let gateCalls = 0;
  await withServer(async () => {
    gateCalls += 1;
    return { reportBytes: Buffer.from('must never be released') };
  }, {}, async port => {
    const forgedHeaders = [
      ['x-authenticated-user', 'synthetic-reviewer'],
      ['remote-user', 'synthetic-reviewer'],
      ['x-reviewer-id', 'synthetic-reviewer'],
      ['x-reviewer-role', 'preview-reviewer'],
      ['x-reviewer-independent', 'true'],
      ['x-test-session', 'synthetic-session']
    ];
    for (const [name, value] of forgedHeaders) {
      const response = await send(port, { headers: { [name]: value } });
      assert.equal(response.status, 400, name);
      assert.match(response.headers['cache-control'], /no-store/);
    }
  });
  assert.equal(gateCalls, 0);
});

test('requires an injected server-side gate and a canonical HTTPS origin at construction', () => {
  assert.throws(
    () => createReviewReleaseHttpHandler({ allowedOrigin: ORIGIN }),
    /server-side releaseReviewedReport function is required/
  );
  assert.throws(
    () => createReviewReleaseHttpHandler({
      allowedOrigin: 'http://preview.example.test',
      releaseReviewedReport: async () => ({ reportBytes: Buffer.from('synthetic') })
    }),
    /canonical HTTPS origin/
  );
});


test('times out an incomplete request body without invoking the release gate', async () => {
  let gateCalls = 0;
  await withServer(async () => {
    gateCalls += 1;
    return { reportBytes: Buffer.from('must not be released') };
  }, { bodyTimeoutMs: 250 }, async port => {
    const response = await new Promise((resolve, reject) => {
      let responseStarted = false;
      const request = http.request({
        hostname: '127.0.0.1',
        port,
        method: 'POST',
        path: DEFAULT_ROUTE_PATH,
        agent: false,
        headers: {
          host: 'preview.example.test',
          origin: ORIGIN,
          'content-type': 'application/json; charset=utf-8',
          'content-length': '64',
          connection: 'close'
        }
      }, incoming => {
        responseStarted = true;
        const chunks = [];
        incoming.on('data', chunk => chunks.push(Buffer.from(chunk)));
        incoming.on('end', () => resolve({
          status: incoming.statusCode,
          headers: incoming.headers,
          body: Buffer.concat(chunks)
        }));
      });
      request.once('error', error => {
        if (!responseStarted) reject(error);
      });
      // Deliberately leave Content-Length unsatisfied to exercise the body deadline.
      request.write('{"envelope":');
    });

    assert.equal(response.status, 408);
    assert.match(response.headers['cache-control'], /no-store/);
    assert.equal(response.headers.connection, 'close');
    assert.match(response.body.toString('utf8'), /مهلت دریافت بدنه درخواست پایان یافت/);
  });
  assert.equal(gateCalls, 0);
});


const { createServer: createDevelopmentServer } = require('../backend/server');

test('signed-review report route stays unavailable for every HTTP method in the development server until a trusted auth adapter is integrated', async () => {
  const hadNodeEnv = Object.prototype.hasOwnProperty.call(process.env, 'NODE_ENV');
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const server = createDevelopmentServer();
  let listening = false;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('listening', resolve);
      server.listen({ host: '127.0.0.1', port: 0 });
    });
    listening = true;
    const address = server.address();
    assert.ok(address && typeof address.port === 'number');

    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const body = method === 'POST' ? '{}' : undefined;
      const response = await new Promise((resolve, reject) => {
        const headers = {
          host: '127.0.0.1:' + address.port,
          connection: 'close'
        };
        if (body !== undefined) {
          headers['content-type'] = 'application/json';
          headers['content-length'] = String(Buffer.byteLength(body));
        }
        const request = http.request({
          hostname: '127.0.0.1',
          port: address.port,
          method,
          path: '/api/dadyar/review-report',
          headers
        }, incoming => {
          const chunks = [];
          incoming.on('data', chunk => chunks.push(Buffer.from(chunk)));
          incoming.on('end', () => resolve({
            status: incoming.statusCode,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString('utf8')
          }));
        });
        request.once('error', reject);
        request.end(body);
      });

      assert.equal(response.status, 404, method + ' must not expose the review route');
      assert.deepEqual(JSON.parse(response.body), { error: 'not_found' }, method);
      assert.match(response.headers['cache-control'], /no-store/, method);
      assert.equal(response.headers['x-content-type-options'], 'nosniff', method);
      assert.equal(response.headers['access-control-allow-origin'], undefined, method);
      assert.equal(response.headers['set-cookie'], undefined, method);
    }
  } finally {
    if (listening) {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
    if (hadNodeEnv) process.env.NODE_ENV = previousNodeEnv;
    else delete process.env.NODE_ENV;
  }
});
