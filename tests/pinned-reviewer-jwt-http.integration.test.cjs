'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createPinnedReviewerJwtAuthenticator, DEFAULT_COOKIE } =
  require('../backend/pinned-reviewer-jwt-authenticator.cjs');
const { createSignedReviewReleaseHttpServer } =
  require('../backend/signed-review-release-http.cjs');
const { canonicalizePayload } =
  require('../scripts/verify-human-review-attestation.cjs');

const ORIGIN = 'https://preview.example.test';
const ROUTE = '/api/dadyar/review-report';

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-review-http-'));
  const ledgerDirectory = path.join(root, 'ledger');
  fs.mkdirSync(ledgerDirectory, { mode: 0o700 });
  fs.chmodSync(ledgerDirectory, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const reviewerIssuer = 'https://identity.example.test/';
  const audience = 'dadyar-preview-review';
  const subject = 'synthetic-reviewer-01';
  const now = Date.now();
  const reportBytes = Buffer.from('گزارش ساختگی چک؛ فاقد داده موکل و اثر حقوقی.', 'utf8');
  const target = {
    sourceCommit: 'a'.repeat(40),
    sourceBlobSha1: 'b'.repeat(40),
    artifactSha256: crypto.createHash('sha256').update(reportBytes).digest('hex')
  };

  const reviewKeys = crypto.generateKeyPairSync('ed25519');
  const trustStore = {
    schema: 'dadyar-review-trust-store-v1',
    issuer: reviewerIssuer,
    reviewers: [{
      subject,
      roles: ['preview-reviewer'],
      active: true,
      public_key_pem: reviewKeys.publicKey.export({ type: 'spki', format: 'pem' })
    }]
  };
  const reviewPayload = {
    schema: 'dadyar-human-review-attestation-v2',
    issuer: reviewerIssuer,
    subject,
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
  const envelope = {
    payload: reviewPayload,
    signature: crypto.sign(
      null, Buffer.from(canonicalizePayload(reviewPayload), 'utf8'), reviewKeys.privateKey
    ).toString('base64url')
  };

  const sessionKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pinnedKey = {
    kid: 'synthetic-session-key-01',
    publicKeyPem: sessionKeys.publicKey.export({ type: 'spki', format: 'pem' })
  };
  const claims = {
    iss: reviewerIssuer,
    sub: subject,
    aud: audience,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 300,
    roles: ['preview-reviewer'],
    reviewer_independent: true
  };
  const header = { alg: 'RS256', kid: pinnedKey.kid, typ: 'JWT' };
  const makeSessionToken = (overrides = {}) => {
    const sessionClaims = { ...claims, ...overrides };
    const input = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(sessionClaims));
    return input + '.' +
      crypto.sign('RSA-SHA256', Buffer.from(input, 'ascii'), sessionKeys.privateKey).toString('base64url');
  };
  const sessionToken = makeSessionToken();

  const authenticateReviewer = createPinnedReviewerJwtAuthenticator({
    issuer: reviewerIssuer,
    audience,
    keys: [pinnedKey],
    now: () => now
  });
  return {
    ledgerDirectory, reportBytes, target, trustStore, envelope,
    authenticateReviewer, sessionToken, makeSessionToken, now
  };
}

function send(port, { token, envelope, origin = ORIGIN, headers = {} } = {}) {
  const body = JSON.stringify({ envelope });
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: ROUTE,
      headers: {
        Host: 'preview.example.test',
        Origin: origin,
        'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { Cookie: DEFAULT_COOKIE + '=' + token } : {}),
        ...headers
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

async function withServer(f, callback) {
  let reportLoads = 0;
  const server = createSignedReviewReleaseHttpServer({
    allowedOrigin: ORIGIN,
    authenticateReviewer: f.authenticateReviewer,
    trustStore: f.trustStore,
    expectedSourceCommit: f.target.sourceCommit,
    expectedSourceBlobSha1: f.target.sourceBlobSha1,
    expectedArtifactSha256: f.target.artifactSha256,
    ledgerDirectory: f.ledgerDirectory,
    loadReviewedReport: async () => {
      reportLoads += 1;
      return f.reportBytes;
    },
    now: () => f.now
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    await callback(server.address().port, () => reportLoads, f.envelope);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

test('pinned RS256 session, signed human review and one-shot ledger release exact report bytes over loopback HTTP', async t => {
  const f = fixture(t);
  await withServer(f, async (port, reportLoads, envelope) => {
    const first = await send(port, { token: f.sessionToken, envelope });
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, f.reportBytes);
    assert.match(first.headers['content-disposition'], /attachment/);
    assert.match(first.headers['cache-control'], /no-store/);
    assert.equal(first.headers['set-cookie'], undefined);
    assert.equal(reportLoads(), 1);

    const replay = await send(port, { token: f.sessionToken, envelope });
    assert.equal(replay.status, 403);
    assert.notDeepEqual(replay.body, f.reportBytes);
    assert.equal(reportLoads(), 2);
  });
});

test('reviewer identity headers without a signed session cookie never load or release a report', async t => {
  const f = fixture(t);
  await withServer(f, async (port, reportLoads, envelope) => {
    const response = await send(port, {
      envelope,
      headers: {
        'X-Authenticated-User': 'synthetic-reviewer-01',
        'X-Reviewer-Role': 'preview-reviewer',
        'X-Reviewer-Independent': 'true'
      }
    });
    assert.equal(response.status, 400);
    assert.notDeepEqual(response.body, f.reportBytes);
    assert.equal(reportLoads(), 0);
  });
});


test('a valid session for a different reviewer cannot release another reviewer’s signed report', async t => {
  const f = fixture(t);
  await withServer(f, async (port, reportLoads, envelope) => {
    const response = await send(port, {
      token: f.makeSessionToken({ sub: 'synthetic-reviewer-02' }),
      envelope
    });
    assert.equal(response.status, 403);
    assert.notDeepEqual(response.body, f.reportBytes);
    assert.equal(reportLoads(), 0);
  });
});

test('missing and expired reviewer sessions are rejected before the report store is read', async t => {
  const f = fixture(t);
  await withServer(f, async (port, reportLoads, envelope) => {
    const missing = await send(port, { envelope });
    assert.equal(missing.status, 401);
    assert.notDeepEqual(missing.body, f.reportBytes);
    assert.equal(reportLoads(), 0);

    const current = Math.floor(f.now / 1000);
    const expiredToken = f.makeSessionToken({
      iat: current - 600,
      exp: current - 300
    });
    const expired = await send(port, { token: expiredToken, envelope });
    assert.equal(expired.status, 401);
    assert.notDeepEqual(expired.body, f.reportBytes);
    assert.equal(reportLoads(), 0);
  });
});
