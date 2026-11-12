'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  verifyHumanReviewAttestation,
  canonicalizePayload
} = require('../scripts/verify-human-review-attestation.cjs');

function fixture() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const now = Date.now();
  const payload = {
    schema: 'dadyar-human-review-attestation-v1',
    issuer: 'synthetic-owner-review-registry',
    subject: 'synthetic-reviewer-01',
    audience: 'dadyar-preview-release',
    decision: 'approved',
    review_id: crypto.randomUUID(),
    source_commit: 'a'.repeat(40),
    artifact_sha256: 'b'.repeat(64),
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
  const attestation = {
    payload,
    signature: crypto.sign(null, Buffer.from(canonicalizePayload(payload)), privateKey).toString('base64url')
  };
  return { payload, trustStore, attestation, privateKey, now };
}

function resign(f, patch) {
  const payload = { ...f.payload, ...patch };
  return {
    payload,
    signature: crypto.sign(null, Buffer.from(canonicalizePayload(payload)), f.privateKey).toString('base64url')
  };
}

function verify(f, overrides = {}) {
  return verifyHumanReviewAttestation({
    attestation: f.attestation,
    trustStore: f.trustStore,
    expectedSourceCommit: f.payload.source_commit,
    expectedArtifactSha256: f.payload.artifact_sha256,
    now: f.now,
    ...overrides
  });
}

test('accepts a current Ed25519 approval bound to the exact preview commit and artifact', () => {
  const f = fixture();
  const result = verify(f);
  assert.equal(result.verified, true);
  assert.equal(result.issuer, f.payload.issuer);
  assert.equal(result.subject, f.payload.subject);
  assert.equal(result.sourceCommit, f.payload.source_commit);
  assert.equal(result.artifactSha256, f.payload.artifact_sha256);
});

test('rejects a tampered payload even when all visible fields remain valid', () => {
  const f = fixture();
  f.attestation.payload.review_id = crypto.randomUUID();
  assert.equal(verify(f).reason, 'invalid_signature');
});

test('rejects a signature for a different source commit or artifact digest', () => {
  const f = fixture();
  assert.equal(verify(f, { expectedSourceCommit: 'c'.repeat(40) }).reason, 'review_target_mismatch');
  assert.equal(verify(f, { expectedArtifactSha256: 'd'.repeat(64) }).reason, 'review_target_mismatch');
});

test('rejects expired and future-dated approvals', () => {
  const f = fixture();
  f.attestation = resign(f, {
    reviewed_at: new Date(f.now - 8 * 24 * 60 * 60 * 1000).toISOString(),
    expires_at: new Date(f.now - 1000).toISOString()
  });
  assert.equal(verify(f).reason, 'review_expired_or_not_current');
  f.attestation = resign(f, {
    reviewed_at: new Date(f.now + 60000).toISOString(),
    expires_at: new Date(f.now + 120000).toISOString()
  });
  assert.equal(verify(f).reason, 'review_expired_or_not_current');
});

test('rejects a reviewer who is absent, inactive, or lacks the preview-reviewer role', () => {
  const f = fixture();
  f.trustStore.reviewers[0].active = false;
  assert.equal(verify(f).reason, 'reviewer_not_trusted');
  f.trustStore.reviewers[0].active = true;
  f.trustStore.reviewers[0].roles = ['observer'];
  assert.equal(verify(f).reason, 'reviewer_not_authorized');
  f.trustStore.reviewers[0].roles = ['preview-reviewer'];
  f.attestation = resign(f, { subject: 'unlisted-reviewer' });
  assert.equal(verify(f).reason, 'reviewer_not_trusted');
});

test('rejects an issuer mismatch and non-approved decision', () => {
  const f = fixture();
  f.attestation = resign(f, { issuer: 'different-issuer' });
  assert.equal(verify(f).reason, 'issuer_mismatch');
  f.attestation = resign(f, { decision: 'rejected' });
  assert.equal(verify(f).reason, 'invalid_review_fields');
});

test('rejects malformed signature encoding and duplicate trust-store subjects', () => {
  const f = fixture();
  f.attestation.signature = 'not-a-signature';
  assert.equal(verify(f).reason, 'invalid_signature_encoding');
  f.attestation = resign(f, {});
  f.trustStore.reviewers.push({ ...f.trustStore.reviewers[0] });
  assert.equal(verify(f).reason, 'duplicate_trust_store_subject');
});
