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
const REPORT = Buffer.from('گزارش ساختگی چک؛ فاقد اثر حقوقی.', 'utf8');

function headers(extra = {}) {
  return {
    Host: 'preview.example.test',
    Origin: ORIGIN,
    'Sec-Fetch-Site': 'same-origin',
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function send(port, { method = 'POST', path = DEFAULT_ROUTE_PATH, body = '{"envelope":{"synthetic":true}}', headers: extraHeaders = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: headers(extraHeaders)
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.once('error', reject);
      response.once('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    request.once('error', reject);
    request.end(body);
  });
}

async function withServer(handler, callback) {
  const server = createReviewReleaseHttpServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  try {
    await callback(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

function handler(releaseReviewedReport, options = {}) {
  return createReviewReleaseHttpHandler({
    allowedOrigin: ORIGIN,
    releaseReviewedReport,
    ...options
  });
}

test('same-origin signed-review adapter returns only server-loaded report bytes', async () => {
  let calls = 0;
  const reportHandler = handler(async ({ request, envelope }) => {
    calls += 1;
    assert.equal(request.headers.host, 'preview.example.test');
    assert.deepEqual(envelope, { synthetic: true });
    return { reportBytes: REPORT };
  });

  await withServer(reportHandler, async port => {
    const response = await send(port);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, REPORT);
    assert.match(response.headers['content-disposition'], /attachment/);
    assert.match(response.headers['cache-control'], /no-store/);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.equal(response.headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal(calls, 1);
  });
});

test('rejects a Host header that does not match the configured HTTPS origin before release', async () => {
  let calls = 0;
  await withServer(handler(async () => {
    calls += 1;
    return { reportBytes: REPORT };
  }), async port => {
    const response = await send(port, { headers: { Host: 'attacker.example.test' } });
    assert.equal(response.status, 421);
    assert.equal(calls, 0);
  });
});

test('rejects a mismatched Origin before invoking the release gate', async () => {
  let calls = 0;
  await withServer(handler(async () => {
    calls += 1;
    return { reportBytes: REPORT };
  }), async port => {
    const response = await send(port, { headers: { Origin: 'https://attacker.example.test' } });
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  });
});

test('rejects query and path aliases instead of normalizing them to the report route', async () => {
  let calls = 0;
  await withServer(handler(async () => {
    calls += 1;
    return { reportBytes: REPORT };
  }), async port => {
    for (const path of [
      DEFAULT_ROUTE_PATH + '?download=1',
      '/api/dadyar/../dadyar/review-report',
      '/api/dadyar/%72eview-report',
      '//' + 'preview.example.test' + DEFAULT_ROUTE_PATH
    ]) {
      const response = await send(port, { path });
      assert.ok([400, 404].includes(response.status), path + ' returned ' + response.status);
    }
    assert.equal(calls, 0);
  });
});

test('rejects duplicate JSON keys and extra top-level fields before loading a report', async () => {
  let calls = 0;
  await withServer(handler(async () => {
    calls += 1;
    return { reportBytes: REPORT };
  }), async port => {
    const duplicate = await send(port, {
      body: '{"envelope":{"reviewer":"one","reviewer":"two"}}'
    });
    const extra = await send(port, {
      body: '{"envelope":{"synthetic":true},"reviewerId":"caller-controlled"}'
    });
    assert.equal(duplicate.status, 400);
    assert.equal(extra.status, 400);
    assert.equal(calls, 0);
  });
});

test('maps an unauthenticated reviewer to 401 and hides internal gate failures', async () => {
  await withServer(handler(async () => {
    throw Object.assign(new Error('authenticated reviewer principal is required'), { code: 'AUTHENTICATED_REVIEWER_REQUIRED' });
  }), async port => {
    const response = await send(port);
    assert.equal(response.status, 401);
    assert.doesNotMatch(response.body.toString('utf8'), /principal/i);
  });

  await withServer(handler(async () => {
    throw new Error('review report storage connection failed');
  }), async port => {
    const response = await send(port);
    assert.equal(response.status, 503);
    assert.doesNotMatch(response.body.toString('utf8'), /srv\/dadyar|private storage/);
  });
});

test('maps only typed attestation rejection to 403 and never parses infrastructure prose', async () => {
  await withServer(handler(async () => {
    throw Object.assign(new Error('review attestation rejected'), {
      code: 'REVIEW_ATTESTATION_REJECTED'
    });
  }), async port => {
    const response = await send(port);
    assert.equal(response.status, 403);
    assert.doesNotMatch(response.body.toString('utf8'), /attestation/i);
  });

  await withServer(handler(async () => {
    throw new Error('signature verification dependency review service unavailable');
  }), async port => {
    const response = await send(port);
    assert.equal(response.status, 503);
  });
});

test('refuses to bind the signed-review HTTP server to a public interface', () => {
  const server = createReviewReleaseHttpServer(async () => {});
  assert.throws(
    () => server.listen(0, '0.0.0.0'),
    /explicit loopback TCP listener/
  );
  assert.throws(
    () => server.listen(0, '::'),
    /explicit loopback TCP listener/
  );
});

test('rejects empty or oversized report bytes returned by the injected gate', async () => {
  await withServer(handler(async () => ({ reportBytes: Buffer.alloc(0) })), async port => {
    const response = await send(port);
    assert.equal(response.status, 503);
  });

  await withServer(handler(async () => ({ reportBytes: Buffer.alloc(16) }), {
    maxReportBytes: 8
  }), async port => {
    const response = await send(port);
    assert.equal(response.status, 503);
  });
});
