'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const {
  SCHEMA,
  POLICY,
  canonicalizeReviewPayload
} = require('../scripts/reviewer-attestation.cjs');
const { createReviewReleaseGate } = require('../backend/review-release-gate.cjs');
const {
  DEFAULT_ROUTE_PATH,
  createReviewReleaseHttpHandler
} = require('../backend/review-release-http-handler.cjs');

const ORIGIN = 'https://preview.example.test';
const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const REVIEWER = 'reviewer.synthetic.01';
const AUTHOR = 'author.synthetic.01';
const SOURCE_COMMIT = 'c'.repeat(40);

function fixture({ decision = 'approved', maxBodyBytes = 2048 } = {}) {
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const artifactBytes = Buffer.from('synthetic preview artifact');
  const reportBytes = Buffer.from('گزارش ساختگی چک؛ فاقد اثر حقوقی.');
  const payload = {
    schema: SCHEMA,
    policyId: POLICY,
    keyId: 'synthetic-http-review-key',
    reviewerId: REVIEWER,
    decision,
    sourceCommit: SOURCE_COMMIT,
    artifactSha256: crypto.createHash('sha256').update(artifactBytes).digest('hex'),
    reportSha256: crypto.createHash('sha256').update(reportBytes).digest('hex'),
    reviewedAt: new Date(NOW).toISOString(),
    nonce: crypto.randomBytes(16).toString('base64url')
  };
  const envelope = {
    payload,
    signature: crypto.sign(
      null,
      Buffer.from(canonicalizeReviewPayload(payload), 'utf8'),
      pair.privateKey
    ).toString('base64url')
  };

  const usedNonces = new Set();
  let materialLoads = 0;
  const gate = createReviewReleaseGate({
    // Test-only session adapter. It reads a synthetic session marker and
    // deliberately ignores caller-supplied reviewer IDs and request bodies.
    authenticateReviewer: async request =>
      request && request.headers && request.headers['x-test-session'] === 'reviewer-session'
        ? { id: REVIEWER }
        : null,
    isIndependentReviewer: async ({ reviewerId }) => reviewerId === REVIEWER,
    loadReleaseMaterial: async () => {
      materialLoads += 1;
      return { sourceCommit: SOURCE_COMMIT, artifactBytes, reportBytes };
    },
    trustedKeys: {
      'synthetic-http-review-key': {
        publicKey,
        reviewerId: REVIEWER,
        status: 'active'
      }
    },
    nonceStore: {
      async consume(nonce) {
        if (usedNonces.has(nonce)) return false;
        usedNonces.add(nonce);
        return true;
      }
    },
    clock: () => NOW
  });

  const handler = createReviewReleaseHttpHandler({
    releaseReviewedReport: gate,
    allowedOrigin: ORIGIN,
    maxBodyBytes
  });

  return {
    handler,
    envelope,
    reportBytes,
    usedNonces,
    get materialLoads() { return materialLoads; }
  };
}

async function withServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = 'http://127.0.0.1:' + address.port + DEFAULT_ROUTE_PATH;
  try {
    await callback(url);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function requestHeaders(overrides = {}) {
  return {
    Origin: ORIGIN,
    'Content-Type': 'application/json; charset=utf-8',
    'Sec-Fetch-Site': 'same-origin',
    'X-Test-Session': 'reviewer-session',
    ...overrides
  };
}

async function post(url, envelope, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: requestHeaders(headers),
    body: JSON.stringify({ envelope })
  });
}

test('releases only the exact server-loaded report after a valid signed approval', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, f.envelope, { 'X-Reviewer-Id': AUTHOR });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.reportBytes);
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="dadyar-reviewed-report.txt"');
    assert.equal(response.headers.get('cache-control'), 'no-store, private, max-age=0');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(f.materialLoads, 1);
  });
});

test('does not trust a caller-supplied reviewer ID header', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, f.envelope, { 'X-Reviewer-Id': AUTHOR });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
});

test('rejects missing server session before loading report material', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, f.envelope, { 'X-Test-Session': '' });
    assert.equal(response.status, 401);
    assert.equal(f.materialLoads, 0);
    assert.match(await response.text(), /نشست بازبین معتبر نیست/);
  });
});

test('rejects a foreign Origin before loading report material', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, f.envelope, { Origin: 'https://attacker.example.test' });
    assert.equal(response.status, 403);
    assert.equal(f.materialLoads, 0);
  });
});

test('rejects cross-site Fetch Metadata before loading report material', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await post(url, f.envelope, { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(response.status, 403);
    assert.equal(f.materialLoads, 0);
  });
});

test('rejects methods other than POST and reports the allowed method', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const response = await fetch(url, { method: 'GET' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
    assert.equal(f.materialLoads, 0);
  });
});

test('does not expose an alternate route or query-string variant', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const wrongPath = await fetch(url.replace(DEFAULT_ROUTE_PATH, '/api/other'));
    const withQuery = await fetch(url + '?download=1');
    assert.equal(wrongPath.status, 404);
    assert.equal(withQuery.status, 404);
    assert.equal(f.materialLoads, 0);
  });
});

test('rejects non-JSON and compressed request bodies', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const wrongType = await fetch(url, {
      method: 'POST',
      headers: requestHeaders({ 'Content-Type': 'text/plain' }),
      body: '{}'
    });
    const compressed = await fetch(url, {
      method: 'POST',
      headers: requestHeaders({ 'Content-Encoding': 'gzip' }),
      body: '{}'
    });
    assert.equal(wrongType.status, 415);
    assert.equal(compressed.status, 415);
    assert.equal(f.materialLoads, 0);
  });
});

test('rejects a declared oversized body before parsing or loading report material', async () => {
  const f = fixture({ maxBodyBytes: 1024 });
  await withServer(f.handler, async url => {
    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify({ envelope: 'x'.repeat(2048) })
    });
    assert.equal(response.status, 413);
    assert.equal(f.materialLoads, 0);
  });
});

test('rejects invalid JSON and unexpected top-level request fields', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const invalidJson = await fetch(url, {
      method: 'POST',
      headers: requestHeaders(),
      body: '{'
    });
    const extraField = await fetch(url, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify({ envelope: f.envelope, reviewerId: REVIEWER })
    });
    assert.equal(invalidJson.status, 400);
    assert.equal(extraField.status, 400);
    assert.equal(f.materialLoads, 0);
  });
});

test('rejects a signed review decision of rejected', async () => {
  const f = fixture({ decision: 'rejected' });
  await withServer(f.handler, async url => {
    const response = await post(url, f.envelope);
    assert.equal(response.status, 403);
    assert.equal(f.materialLoads, 1);
    assert.equal(await response.text(), 'بازبینی معتبر یا مجوز دریافت گزارش احراز نشد.');
  });
});

test('prevents replay of the same signed approval at the HTTP boundary', async () => {
  const f = fixture();
  await withServer(f.handler, async url => {
    const first = await post(url, f.envelope);
    const second = await post(url, f.envelope);
    assert.equal(first.status, 200);
    assert.equal(second.status, 403);
    assert.equal(f.usedNonces.size, 1);
  });
});

test('does not leak internal storage errors to the HTTP client', async () => {
  const handler = createReviewReleaseHttpHandler({
    allowedOrigin: ORIGIN,
    releaseReviewedReport: async () => {
      throw new Error('private storage path /srv/dadyar/private failed');
    }
  });
  await withServer(handler, async url => {
    const response = await post(url, { payload: {}, signature: 'x' });
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.doesNotMatch(body, /srv\/dadyar|private storage path/);
  });
});

test('requires a canonical HTTPS origin and bounded configuration', () => {
  assert.throws(() => createReviewReleaseHttpHandler({
    releaseReviewedReport: async () => ({}),
    allowedOrigin: 'http://preview.example.test'
  }), /canonical HTTPS origin/);
  assert.throws(() => createReviewReleaseHttpHandler({
    releaseReviewedReport: async () => ({}),
    allowedOrigin: 'https://preview.example.test/path'
  }), /canonical HTTPS origin/);
  assert.throws(() => createReviewReleaseHttpHandler({
    releaseReviewedReport: async () => ({}),
    allowedOrigin: ORIGIN,
    maxBodyBytes: 999999
  }), /maxBodyBytes/);
});
