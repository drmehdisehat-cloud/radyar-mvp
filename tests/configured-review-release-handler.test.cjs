'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createConfiguredReviewReleaseHandler } = require('../backend/configured-review-release-handler.cjs');
const { createReviewReleaseHttpServer } = require('../backend/review-release-http-handler.cjs');
const { canonicalizePayload } = require('../scripts/verify-human-review-attestation.cjs');

const ORIGIN = 'https://dadyar-preview.test';
const ISSUER = 'https://idp.example.test/';
const AUDIENCE = 'dadyar-preview-release-api';
const SOURCE_COMMIT = 'a'.repeat(40);
const SOURCE_BLOB = 'b'.repeat(40);

function signJwt(header, claims, privateKey) {
  const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const first = encode(header);
  const second = encode(claims);
  const signingInput = first + '.' + second;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'ascii'), privateKey);
  return signingInput + '.' + signature.toString('base64url');
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-oidc-review-'));
  const ledgerDirectory = path.join(root, 'ledger');
  fs.mkdirSync(ledgerDirectory, { mode: 0o700 });
  fs.chmodSync(ledgerDirectory, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const now = Date.now();
  const idpKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const reviewerKeys = crypto.generateKeyPairSync('ed25519');
  const reportBytes = Buffer.from('گزارش ساختگی چک؛ داده موکل نیست و اثر حقوقی ندارد.', 'utf8');
  const artifactSha256 = crypto.createHash('sha256').update(reportBytes).digest('hex');
  const reviewerIssuer = 'synthetic-owner-review-registry';
  const reviewerSubject = 'synthetic-reviewer-01';
  const reviewPayload = {
    schema: 'dadyar-human-review-attestation-v2',
    issuer: reviewerIssuer,
    subject: reviewerSubject,
    audience: 'dadyar-preview-release',
    decision: 'approved',
    review_id: crypto.randomUUID(),
    source_commit: SOURCE_COMMIT,
    source_blob_sha1: SOURCE_BLOB,
    artifact_sha256: artifactSha256,
    reviewed_at: new Date(now - 30000).toISOString(),
    expires_at: new Date(now + 5 * 60 * 1000).toISOString(),
    nonce: crypto.randomBytes(32).toString('base64url')
  };
  const attestation = {
    payload: reviewPayload,
    signature: crypto.sign(null, Buffer.from(canonicalizePayload(reviewPayload), 'utf8'),
      reviewerKeys.privateKey).toString('base64url')
  };
  const trustStore = {
    schema: 'dadyar-review-trust-store-v1',
    issuer: reviewerIssuer,
    reviewers: [{
      subject: reviewerSubject,
      roles: ['preview-reviewer'],
      active: true,
      public_key_pem: reviewerKeys.publicKey.export({ type: 'spki', format: 'pem' })
    }]
  };
  const identityProvider = {
    issuer: ISSUER,
    audience: AUDIENCE,
    reviewIssuer: reviewerIssuer,
    keys: [{
      kid: 'synthetic-idp-key-01',
      publicKeyPem: idpKeys.publicKey.export({ type: 'spki', format: 'pem' })
    }],
    now: () => now,
    maxTokenAgeSeconds: 600,
    clockSkewSeconds: 30,
    isSessionActive: async () => true
  };
  const claims = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: reviewerSubject,
    iat: Math.floor(now / 1000) - 30,
    exp: Math.floor(now / 1000) + 300,
    nbf: Math.floor(now / 1000) - 30,
    jti: crypto.randomBytes(32).toString('base64url'),
    roles: ['preview-reviewer'],
    reviewer_independent: true
  };
  const makeToken = patch => signJwt({
    alg: 'RS256',
    typ: 'JWT',
    kid: 'synthetic-idp-key-01'
  }, { ...claims, ...patch }, idpKeys.privateKey);

  let reportLoads = 0;
  const handler = createConfiguredReviewReleaseHandler({
    identityProvider,
    allowedOrigin: ORIGIN,
    trustStore,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedSourceBlobSha1: SOURCE_BLOB,
    expectedArtifactSha256: artifactSha256,
    ledgerDirectory,
    loadReviewedReport: async () => {
      reportLoads += 1;
      return reportBytes;
    },
    now: () => now
  });
  return {
    root, ledgerDirectory, now, reportBytes, artifactSha256, attestation,
    makeToken, handler, reportLoads: () => reportLoads
  };
}

function send(port, { token, envelope, headers = {}, origin = ORIGIN } = {}) {
  const body = Buffer.from(JSON.stringify({ envelope }), 'utf8');
  const requestHeaders = {
    host: 'dadyar-preview.test',
    origin,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json; charset=utf-8',
    ...headers
  };
  if (token !== undefined) requestHeaders.authorization = 'Bearer ' + token;

  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/dadyar/review-report',
      method: 'POST',
      headers: requestHeaders
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
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

async function withServer(t, run) {
  const f = fixture(t);
  const server = createReviewReleaseHttpServer(f.handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  t.after(() => new Promise(resolve => server.close(resolve)));
  await run({ ...f, port: address.port });
}

test('configured OIDC adapter releases only the exact server-held report after signed approval', async t => {
  await withServer(t, async f => {
    const response = await send(f.port, { token: f.makeToken({}), envelope: f.attestation });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, f.reportBytes);
    assert.match(response.headers['cache-control'], /no-store/);
    assert.match(response.headers['content-disposition'], /dadyar-reviewed-report\.txt/);
    assert.equal(f.reportLoads(), 1);
    assert.equal(fs.readdirSync(f.ledgerDirectory).length, 2);
  });
});

test('missing or invalid bearer identity is rejected before the report store is read', async t => {
  await withServer(t, async f => {
    const missing = await send(f.port, { envelope: f.attestation });
    assert.equal(missing.status, 401);
    const wrongAudience = await send(f.port, {
      token: f.makeToken({ aud: 'another-api' }), envelope: f.attestation
    });
    assert.equal(wrongAudience.status, 401);
    const expired = await send(f.port, {
      token: f.makeToken({ exp: Math.floor(f.now / 1000) - 1 }), envelope: f.attestation
    });
    assert.equal(expired.status, 401);
    assert.equal(f.reportLoads(), 0);
  });
});

test('authenticated but non-independent or incorrectly assigned users cannot release a report', async t => {
  await withServer(t, async f => {
    const wrongRole = await send(f.port, {
      token: f.makeToken({ roles: ['admin'] }), envelope: f.attestation
    });
    assert.equal(wrongRole.status, 403);
    const notIndependent = await send(f.port, {
      token: f.makeToken({ reviewer_independent: false }), envelope: f.attestation
    });
    assert.equal(notIndependent.status, 403);
    assert.equal(f.reportLoads(), 0);
  });
});

test('review approval is single-use and a replay is rejected before a second report-store read', async t => {
  await withServer(t, async f => {
    const first = await send(f.port, { token: f.makeToken({}), envelope: f.attestation });
    const replay = await send(f.port, { token: f.makeToken({}), envelope: f.attestation });
    assert.equal(first.status, 200);
    assert.equal(replay.status, 403);
    assert.equal(f.reportLoads(), 1);
  });
});

test('a review signed for another artifact or a forged review signature cannot release a report', async t => {
  await withServer(t, async f => {
    const wrongArtifactPayload = { ...f.attestation.payload, artifact_sha256: 'c'.repeat(64) };
    const wrongArtifact = {
      payload: wrongArtifactPayload,
      signature: f.attestation.signature
    };
    const wrongArtifactResponse = await send(f.port, {
      token: f.makeToken({}), envelope: wrongArtifact
    });
    assert.equal(wrongArtifactResponse.status, 403);

    const forged = {
      payload: f.attestation.payload,
      signature: Buffer.alloc(64).toString('base64url')
    };
    const forgedResponse = await send(f.port, { token: f.makeToken({}), envelope: forged });
    assert.equal(forgedResponse.status, 403);
    assert.equal(f.reportLoads(), 0);
  });
});
