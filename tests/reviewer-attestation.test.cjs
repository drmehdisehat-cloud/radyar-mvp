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
  const consumed = new Set();
  return {
    pair,
    publicPem,
    payload,
    envelope: { payload, signature },
    consumed,
    options: {
      trustedKeys: { 'synthetic-review-key': publicPem },
      expected: {
        sourceCommit: COMMIT,
        artifactSha256: ARTIFACT,
        reportSha256: REPORT,
        reviewerId: REVIEWER
      },
      nonceStore: {
        async consume(nonce) {
          if (consumed.has(nonce)) return false;
          consumed.add(nonce);
          return true;
        }
      },
      now: NOW
    }
  };
}

test('accepts a valid Ed25519 approval bound to the exact commit, artifact and report', async () => {
  const f = fixture();
  const result = await verifyReviewAttestation(f.envelope, f.options);
  assert.equal(result.verified, true);
  assert.equal(result.decision, 'approved');
  assert.equal(result.sourceCommit, COMMIT);
  assert.equal(result.artifactSha256, ARTIFACT);
  assert.equal(result.reportSha256, REPORT);
  assert.equal(result.reviewerId, REVIEWER);
});

test('rejects a report hash substituted after signing', async () => {
  const f = fixture();
  const altered = { ...f.envelope, payload: { ...f.payload, reportSha256: 'c'.repeat(64) } };
  await assert.rejects(verifyReviewAttestation(altered, f.options), /does not match expected reportSha256/);
});

test('rejects a source commit mismatch', async () => {
  const f = fixture();
  const expected = { ...f.options, expected: { ...f.options.expected, sourceCommit: 'd'.repeat(40) } };
  await assert.rejects(verifyReviewAttestation(f.envelope, expected), /does not match expected sourceCommit/);
});

test('rejects an artifact hash mismatch', async () => {
  const f = fixture();
  const expected = { ...f.options, expected: { ...f.options.expected, artifactSha256: 'c'.repeat(64) } };
  await assert.rejects(verifyReviewAttestation(f.envelope, expected), /does not match expected artifactSha256/);
});

test('rejects a signed rejection even when its signature is valid', async () => {
  const f = fixture({ decision: 'rejected' });
  await assert.rejects(verifyReviewAttestation(f.envelope, f.options), /Rejected review/);
});

test('rejects an untrusted key identifier', async () => {
  const f = fixture({ keyId: 'unknown-review-key' });
  await assert.rejects(verifyReviewAttestation(f.envelope, f.options), /not trusted/);
});

test('rejects an expired approval and a timestamp too far in the future', async () => {
  const expired = fixture({ reviewedAt: '2026-11-12T00:00:00.000Z' });
  await assert.rejects(verifyReviewAttestation(expired.envelope, expired.options), /expired/);
  const future = fixture({ reviewedAt: '2026-11-14T12:10:00.000Z' });
  await assert.rejects(verifyReviewAttestation(future.envelope, future.options), /future/);
});

test('rejects payloads with missing or unexpected fields', () => {
  const f = fixture();
  const extra = { ...f.payload, email: 'not-allowed@example.invalid' };
  assert.throws(() => canonicalizeReviewPayload(extra), /missing or unexpected fields/);
  const { nonce, ...missing } = f.payload;
  assert.throws(() => canonicalizeReviewPayload(missing), /missing or unexpected fields/);
});

test('rejects malformed signatures and non-Ed25519 trusted keys', async () => {
  const f = fixture();
  await assert.rejects(verifyReviewAttestation({ ...f.envelope, signature: 'bad' }, f.options), /64-byte/);
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rsaPem = rsa.publicKey.export({ type: 'spki', format: 'pem' });
  const options = { ...f.options, trustedKeys: { 'synthetic-review-key': rsaPem } };
  await assert.rejects(verifyReviewAttestation(f.envelope, options), /must be Ed25519/);
});

test('rejects an invalid signature and a reviewer identity mismatch', async () => {
  const f = fixture();
  const wrongSignature = { ...f.envelope, signature: crypto.randomBytes(64).toString('base64url') };
  await assert.rejects(verifyReviewAttestation(wrongSignature, f.options), /signature verification failed/);
  const expected = { ...f.options, expected: { ...f.options.expected, reviewerId: 'reviewer.other.02' } };
  await assert.rejects(verifyReviewAttestation(f.envelope, expected), /does not match expected reviewerId/);
});

test('rejects non-canonical, impossible timestamps and malformed nonces', () => {
  const f = fixture();
  assert.throws(() => canonicalizeReviewPayload({ ...f.payload, reviewedAt: '2026-11-14T12:00:00Z' }), /canonical UTC ISO-8601/);
  assert.throws(() => canonicalizeReviewPayload({ ...f.payload, reviewedAt: '2026-13-14T12:00:00.000Z' }), /real canonical UTC date/);
  assert.throws(() => canonicalizeReviewPayload({ ...f.payload, nonce: 'short' }), /16 random bytes/);
});

test('requires atomic nonce consumption and rejects replayed approvals', async () => {
  const f = fixture();
  const { nonceStore, ...withoutStore } = f.options;
  await assert.rejects(verifyReviewAttestation(f.envelope, withoutStore), /nonce store is required/);
  assert.equal((await verifyReviewAttestation(f.envelope, f.options)).verified, true);
  await assert.rejects(verifyReviewAttestation(f.envelope, f.options), /already used/);
});

test('fails closed when the replay-protection store cannot consume a nonce', async () => {
  const f = fixture();
  const options = { ...f.options, nonceStore: { async consume() { return false; } } };
  await assert.rejects(verifyReviewAttestation(f.envelope, options), /already used or could not be atomically consumed/);
});
