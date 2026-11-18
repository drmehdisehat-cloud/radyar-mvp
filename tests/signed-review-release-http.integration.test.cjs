'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createSignedReviewReleaseHttpServer } = require('../backend/signed-review-release-http.cjs');
const { canonicalizePayload } = require('../scripts/verify-human-review-attestation.cjs');

const ORIGIN = 'https://preview.example.test';
const ROUTE = '/api/dadyar/review-report';

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-signed-http-'));
  const ledgerDirectory = path.join(root, 'ledger');
  fs.mkdirSync(ledgerDirectory, { mode: 0o700 });
  fs.chmodSync(ledgerDirectory, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const now = Date.now();
  const reportBytes = Buffer.from('گزارش ساختگی چک؛ فاقد داده موکل و اثر حقوقی.', 'utf8');
  const target = {
    sourceCommit: 'a'.repeat(40),
    sourceBlobSha1: 'b'.repeat(40),
    artifactSha256: crypto.createHash('sha256').update(reportBytes).digest('hex')
  };
  const payload = {
    schema: 'dadyar-human-review-attestation-v2',
    issuer: 'synthetic-owner-review-registry',
    subject: 'synthetic-reviewer-01',
    audience: 'dadyar-preview-release',
    decision: 'approved',
    review_id: crypto.randomUUID(),
    source_commit: target.sourceCommit,
    source_blob_sha1: target.sourceBlobSha1,
    artifact_sha256: target.artifactSha256,
    reviewed_at: new Date(now - 30000).toISOString(),
    expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
    nonce: crypto.randomBytes(32).toString('base64url')
  };
  const trustStore = {
    schema: 'dadyar-review-trust-store-v1',
    issuer: payload.issuer,
    reviewers: [{
      subject: payload.subject,
      roles: ['preview-reviewer'],
      active: true,
      public_key_pem: publicKey.export({ type: 'spki', format: 'pem' })
    }]
  };
  const principal = {
    authenticated: true,
    independent: true,
    issuer: payload.issuer,
    subject: payload.subject,
    roles: ['preview-reviewer']
  };
  const envelope = {
    payload,
    signature: crypto.sign(
      null,
      Buffer.from(canonicalizePayload(payload), 'utf8'),
      privateKey
    ).toString('base64url')
  };
  return {
    root, ledgerDirectory, now, reportBytes, target, trustStore, principal,
    envelope, privateKey, ...overrides
  };
}

function send(port, { origin = ORIGIN, envelope, path: requestPath = ROUTE } = {}) {
  const body = JSON.stringify({ envelope });
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: requestPath,
      headers: {
        Host: 'preview.example.test',
        Origin: origin,
        'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      }
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

async function withServer(options, callback) {
  const server = createSignedReviewReleaseHttpServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    await callback(server.address().port, server);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

function serverOptions(f, overrides = {}) {
  return {
    allowedOrigin: ORIGIN,
    authenticateReviewer: async () => f.principal,
    trustStore: f.trustStore,
    expectedSourceCommit: f.target.sourceCommit,
    expectedSourceBlobSha1: f.target.sourceBlobSha1,
    expectedArtifactSha256: f.target.artifactSha256,
    ledgerDirectory: f.ledgerDirectory,
    loadReviewedReport: async () => f.reportBytes,
    now: () => f.now,
    ...overrides
  };
}

test('integrated HTTP route releases exact reviewed bytes once and rejects replay', async t => {
  const f = fixture(t);
  await withServer(serverOptions(f), async port => {
    const first = await send(port, { envelope: f.envelope });
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, f.reportBytes);
    assert.match(first.headers['content-disposition'], /attachment/);
    assert.match(first.headers['cache-control'], /no-store/);
    assert.equal(first.headers['set-cookie'], undefined);

    const replay = await send(port, { envelope: f.envelope });
    assert.equal(replay.status, 403);
    assert.notDeepEqual(replay.body, f.reportBytes);
    assert.equal(replay.headers['cache-control'], 'no-store, private, max-age=0');
  });
});

test('integrated HTTP route authenticates before loading report bytes', async t => {
  const f = fixture(t);
  let loads = 0;
  await withServer(serverOptions(f, {
    authenticateReviewer: async () => ({ authenticated: false }),
    loadReviewedReport: async () => {
      loads += 1;
      return f.reportBytes;
    }
  }), async port => {
    const response = await send(port, { envelope: f.envelope });
    assert.equal(response.status, 401);
    assert.equal(loads, 0);
    assert.notDeepEqual(response.body, f.reportBytes);
  });
});

test('integrated HTTP route rejects cross-origin requests before authentication', async t => {
  const f = fixture(t);
  let authentications = 0;
  await withServer(serverOptions(f, {
    authenticateReviewer: async () => {
      authentications += 1;
      return f.principal;
    }
  }), async port => {
    const response = await send(port, {
      envelope: f.envelope,
      origin: 'https://attacker.example.test'
    });
    assert.equal(response.status, 403);
    assert.equal(authentications, 0);
    assert.notDeepEqual(response.body, f.reportBytes);
  });
});

test('integrated signed-review server refuses public listeners', t => {
  const f = fixture(t);
  const server = createSignedReviewReleaseHttpServer(serverOptions(f));
  assert.throws(() => server.listen(0, '0.0.0.0'), /explicit loopback TCP listener/);
  assert.throws(() => server.listen(0, '::'), /explicit loopback TCP listener/);
});
