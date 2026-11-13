'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  SCHEMA,
  POLICY,
  canonicalizeReviewPayload,
  verifyReviewAttestation
} = require('../scripts/reviewer-attestation.cjs');

const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const COMMIT = 'be3017df5a19a398f4e3ca9ce2ab2d946f873243';
const ARTIFACT = 'a'.repeat(64);
const REPORT = 'b'.repeat(64);
const REVIEWER = 'reviewer.synthetic.01';

function fixture(overrides = {}) {
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const payload = {
    schema: SCHEMA,
    policyId: POLICY,
    keyId: 'synthetic-review-key',
    reviewerId: REVIEWER,
    decision: 'approved',
    sourceCommit: COMMIT,
    artifactSha256: ARTIFACT,
    reportSha256: REPORT,
    reviewedAt: new Date(NOW).toISOString(),
    nonce: crypto.randomBytes(16).toString('base64url'),
    ...overrides
  };
  const signature = crypto.sign(
    null,
    Buffer.from(canonicalizeReviewPayload(payload), 'utf8'),
    pair.privateKey
  ).toString('base64url');
  return {
    pair,
    publicPem,
    payload,
    envelope: { payload, signature },
    options: {
      trustedKeys: { 'synthetic-review-key': publicPem },
      expected: {
        sourceCommit: COMMIT,
        artifactSha256: ARTIFACT,
        reportSha256: REPORT,
        reviewerId: REVIEWER
      },
      now: NOW
    }
  };
}

test('accepts a valid Ed25519 approval bound to the exact commit, artifact and report', () => {
  const f = fixture();
  const result = verifyReviewAttestation(f.envelope, f.options);
  assert.equal(result.verified, true);
  assert.equal(result.decision, 'approved');
  assert.equal(result.sourceCommit, COMMIT);
  assert.equal(result.artifactSha256, ARTIFACT);
  assert.equal(result.reportSha256, REPORT);
  assert.equal(result.reviewerId, REVIEWER);
});

test('rejects a report hash substituted after signing', () => {
  const f = fixture();
  const altered = { ...f.envelope, payload: { ...f.payload, reportSha256: 'c'.repeat(64) } };
  assert.throws(() => verifyReviewAttestation(altered, f.options), /does not match expected reportSha256/);
});

test('rejects a source commit mismatch', () => {
  const f = fixture();
  const expected = { ...f.options, expected: { ...f.options.expected, sourceCommit: 'd'.repeat(40) } };
  assert.throws(() => verifyReviewAttestation(f.envelope, expected), /does not match expected sourceCommit/);
});

test('rejects an artifact hash mismatch', () => {
  const f = fixture();
  const expected = { ...f.options, expected: { ...f.options.expected, artifactSha256: 'c'.repeat(64) } };
  assert.throws(() => verifyReviewAttestation(f.envelope, expected), /does not match expected artifactSha256/);
});

test('rejects a signed rejection even when its signature is valid', () => {
  const f = fixture({ decision: 'rejected' });
  assert.throws(() => verifyReviewAttestation(f.envelope, f.options), /Rejected review/);
});

test('rejects an untrusted key identifier', () => {
  const f = fixture({ keyId: 'unknown-review-key' });
  assert.throws(() => verifyReviewAttestation(f.envelope, f.options), /not trusted/);
});

test('rejects an expired approval and a timestamp too far in the future', () => {
  const expired = fixture({ reviewedAt: '2026-11-12T00:00:00.000Z' });
  assert.throws(() => verifyReviewAttestation(expired.envelope, expired.options), /expired/);
  const future = fixture({ reviewedAt: '2026-11-14T12:10:00.000Z' });
  assert.throws(() => verifyReviewAttestation(future.envelope, future.options), /future/);
});

test('rejects payloads with missing or unexpected fields', () => {
  const f = fixture();
  const extra = { ...f.payload, email: 'not-allowed@example.invalid' };
  assert.throws(() => canonicalizeReviewPayload(extra), /missing or unexpected fields/);
  const { nonce, ...missing } = f.payload;
  assert.throws(() => canonicalizeReviewPayload(missing), /missing or unexpected fields/);
});

test('rejects malformed signatures and non-Ed25519 trusted keys', () => {
  const f = fixture();
  assert.throws(() => verifyReviewAttestation({ ...f.envelope, signature: 'bad' }, f.options), /64-byte/);
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rsaPem = rsa.publicKey.export({ type: 'spki', format: 'pem' });
  const options = { ...f.options, trustedKeys: { 'synthetic-review-key': rsaPem } };
  assert.throws(() => verifyReviewAttestation(f.envelope, options), /must be Ed25519/);
});

test('rejects an invalid signature and a reviewer identity mismatch', () => {
  const f = fixture();
  const wrongSignature = { ...f.envelope, signature: crypto.randomBytes(64).toString('base64url') };
  assert.throws(() => verifyReviewAttestation(wrongSignature, f.options), /signature verification failed/);
  const expected = { ...f.options, expected: { ...f.options.expected, reviewerId: 'reviewer.other.02' } };
  assert.throws(() => verifyReviewAttestation(f.envelope, expected), /does not match expected reviewerId/);
});

test('rejects non-canonical timestamps and malformed nonces', () => {
  const f = fixture({ reviewedAt: '2026-11-14T12:00:00Z' });
  assert.throws(() => canonicalizeReviewPayload(f.payload), /canonical UTC ISO-8601/);
  const g = fixture({ nonce: 'short' });
  assert.throws(() => canonicalizeReviewPayload(g.payload), /16 random bytes/);
});
