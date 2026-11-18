'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSignedReviewReleaseGate } = require('../backend/signed-review-release-gate.cjs');
const { canonicalizePayload } = require('../scripts/verify-human-review-attestation.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-signed-release-'));
  const ledgerDirectory = path.join(root, 'ledger');
  fs.mkdirSync(ledgerDirectory, { mode: 0o700 });
  fs.chmodSync(ledgerDirectory, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const now = Date.now();
  const reportBytes = Buffer.from('گزارش ساختگی چک؛ فاقد داده موکل و اثر حقوقی.', 'utf8');
  const target = {
    sourceCommit: 'a'.repeat(40),
    sourceBlobSha1: 'c'.repeat(40),
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
  const attestation = {
    payload,
    signature: crypto.sign(null, Buffer.from(canonicalizePayload(payload), 'utf8'), privateKey).toString('base64url')
  };
  return { root, ledgerDirectory, now, reportBytes, target, payload, trustStore, principal, attestation, privateKey };
}

function resign(f, patch) {
  const payload = { ...f.payload, ...patch };
  return {
    payload,
    signature: crypto.sign(null, Buffer.from(canonicalizePayload(payload), 'utf8'), f.privateKey).toString('base64url')
  };
}

function gate(f, overrides = {}) {
  return createSignedReviewReleaseGate({
    authenticateReviewer: async () => f.principal,
    trustStore: f.trustStore,
    expectedSourceCommit: f.target.sourceCommit,
    expectedSourceBlobSha1: f.target.sourceBlobSha1,
    expectedArtifactSha256: f.target.artifactSha256,
    ledgerDirectory: f.ledgerDirectory,
    loadReviewedReport: async () => f.reportBytes,
    now: () => f.now,
    ...overrides
  });
}

const request = Object.freeze({ method: 'POST', url: '/api/dadyar/review-report' });
const call = (release, envelope) => release({ request, envelope });

test('returns only the exact server-loaded report after authenticated independent review and one-shot consumption', async t => {
  const f = fixture(t);
  const release = gate(f);
  const result = await call(release, f.attestation);
  assert.deepEqual(result.reportBytes, f.reportBytes);
  assert.equal(fs.readdirSync(f.ledgerDirectory).length, 2);
  await assert.rejects(() => call(release, f.attestation),
    error => error.code === 'REVIEW_ATTESTATION_REJECTED');
  assert.equal(fs.readdirSync(f.ledgerDirectory).length, 2);
});

test('requires an authenticated reviewer before reading report storage', async t => {
  const f = fixture(t);
  let loads = 0;
  const release = gate(f, {
    authenticateReviewer: async () => ({ authenticated: false }),
    loadReviewedReport: async () => { loads += 1; return f.reportBytes; }
  });
  await assert.rejects(() => call(release, f.attestation),
    error => error.code === 'AUTHENTICATED_REVIEWER_REQUIRED');
  assert.equal(loads, 0);
  assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);
});

test('requires the authenticated session subject to match the signed reviewer', async t => {
  const f = fixture(t);
  f.principal = { ...f.principal, subject: 'synthetic-other-reviewer' };
  const release = gate(f);
  await assert.rejects(() => call(release, f.attestation),
    error => error.code === 'REVIEW_ATTESTATION_REJECTED');
  assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);
});

test('requires the identity adapter to attest reviewer independence and role', async t => {
  const f = fixture(t);
  f.principal = { ...f.principal, independent: false };
  const release = gate(f);
  await assert.rejects(() => call(release, f.attestation),
    error => error.code === 'REVIEW_ATTESTATION_REJECTED');
  assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);
});

test('rejects a forged signature and a review bound to a different source commit', async t => {
  const f = fixture(t);
  const release = gate(f);
  const forged = { ...f.attestation, signature: Buffer.alloc(64).toString('base64url') };
  await assert.rejects(() => call(release, forged),
    error => error.code === 'REVIEW_ATTESTATION_REJECTED');
  const wrongTarget = resign(f, { source_commit: 'd'.repeat(40) });
  await assert.rejects(() => call(release, wrongTarget),
    error => error.code === 'REVIEW_ATTESTATION_REJECTED');
  assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);
});

test('does not consume a review nonce when report storage is unavailable or has the wrong digest', async t => {
  const f = fixture(t);
  const unavailable = gate(f, {
    loadReviewedReport: async () => { throw new Error('synthetic storage outage'); }
  });
  await assert.rejects(() => call(unavailable, f.attestation),
    error => error.code === 'REVIEW_RELEASE_UNAVAILABLE');
  assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);

  const mismatched = gate(f, {
    loadReviewedReport: async () => Buffer.from('tampered synthetic report')
  });
  await assert.rejects(() => call(mismatched, f.attestation),
    error => error.code === 'REVIEW_RELEASE_UNAVAILABLE');
  assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);
});

test('pins a private trust-store snapshot at construction', async t => {
  const f = fixture(t);
  const release = gate(f);
  f.trustStore.reviewers[0].active = false;
  const result = await call(release, f.attestation);
  assert.deepEqual(result.reportBytes, f.reportBytes);
});

test('rejects reports above the configured byte limit before consuming the attestation', async t => {
  const f = fixture(t);
  const release = gate(f, { maxReportBytes: 8 });
  await assert.rejects(() => call(release, f.attestation),
    error => error.code === 'REVIEW_RELEASE_UNAVAILABLE');
  assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);
});

test('rejects a non-canonical or incomplete composition at construction', t => {
  const f = fixture(t);
  assert.throws(() => createSignedReviewReleaseGate({
    authenticateReviewer: async () => f.principal,
    trustStore: f.trustStore,
    expectedSourceCommit: '0'.repeat(40),
    expectedSourceBlobSha1: f.target.sourceBlobSha1,
    expectedArtifactSha256: f.target.artifactSha256,
    ledgerDirectory: f.ledgerDirectory,
    loadReviewedReport: async () => f.reportBytes
  }), /source commit SHA/);
});

test('fails closed when the trusted identity adapter throws or returns no principal', async t => {
  for (const authenticateReviewer of [
    async () => { throw new Error('synthetic identity-provider outage'); },
    async () => null
  ]) {
    const f = fixture(t);
    let loads = 0;
    const release = gate(f, {
      authenticateReviewer,
      loadReviewedReport: async () => {
        loads += 1;
        return f.reportBytes;
      }
    });

    await assert.rejects(() => call(release, f.attestation),
      error => error.code === 'AUTHENTICATED_REVIEWER_REQUIRED');
    assert.equal(loads, 0);
    assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);
  }
});
