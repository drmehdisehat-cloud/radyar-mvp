'use strict';
// Verify a detached Ed25519 human-review statement against an owner-managed trust store.
// This proves signature integrity and key-to-subject mapping only; it does not create identity.
const crypto = require('node:crypto');

const SHA256 = /^[a-f0-9]{64}$/i;
const COMMIT = /^[a-f0-9]{40}$/i;
const GIT_BLOB_SHA1 = /^[a-f0-9]{40}$/i;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const MAX_REVIEW_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAYLOAD_KEYS = [
  'schema', 'issuer', 'subject', 'audience', 'decision', 'review_id',
  'source_commit', 'source_blob_sha1', 'artifact_sha256', 'reviewed_at', 'expires_at', 'nonce'
];
const TRUST_KEYS = ['schema', 'issuer', 'reviewers'];
const REVIEWER_KEYS = ['subject', 'roles', 'active', 'public_key_pem'];

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function exactKeys(value, expected) {
  return plainObject(value) &&
    Object.keys(value).sort().join('\n') === [...expected].sort().join('\n');
}

function canonicalizePayload(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalizePayload).join(',') + ']';
  if (!plainObject(value)) throw new TypeError('attestation_payload_not_plain_json');
  return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonicalizePayload(value[key])
  ).join(',') + '}';
}

function validUtc(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function decodeCanonicalBase64url(value, expectedBytes, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== expectedBytes || decoded.toString('base64url') !== value) return null;
  return decoded;
}

// Identity labels come from an owner-pinned registry, but they still cross a
// serialization and audit boundary. Reject invisible/control characters and
// surrounding whitespace so logs and review records cannot visually disagree.
function isSafeIdentityLabel(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value);
}

function verifyHumanReviewAttestation({
  attestation,
  trustStore,
  expectedSourceCommit,
  expectedSourceBlobSha1,
  expectedArtifactSha256,
  now = Date.now()
} = {}) {
  const fail = reason => ({ verified: false, reason });
  if (!exactKeys(attestation, ['payload', 'signature']) ||
      !exactKeys(attestation.payload, PAYLOAD_KEYS)) return fail('invalid_attestation_shape');
  if (!exactKeys(trustStore, TRUST_KEYS) ||
      trustStore.schema !== 'dadyar-review-trust-store-v1' ||
      !isSafeIdentityLabel(trustStore.issuer) ||
      !Array.isArray(trustStore.reviewers) ||
      trustStore.reviewers.length < 1 || trustStore.reviewers.length > 100) {
    return fail('invalid_trust_store');
  }

  const p = attestation.payload;
  if (p.schema !== 'dadyar-human-review-attestation-v2' ||
      p.audience !== 'dadyar-preview-release' ||
      p.decision !== 'approved' ||
      !isSafeIdentityLabel(p.issuer) ||
      !isSafeIdentityLabel(p.subject) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.review_id || '') ||
      !COMMIT.test(p.source_commit || '') || /^0{40}$/i.test(p.source_commit) ||
      !GIT_BLOB_SHA1.test(p.source_blob_sha1 || '') || /^0{40}$/i.test(p.source_blob_sha1) ||
      !SHA256.test(p.artifact_sha256 || '') || /^0{64}$/i.test(p.artifact_sha256) ||
      !validUtc(p.reviewed_at) || !validUtc(p.expires_at) ||
      !decodeCanonicalBase64url(p.nonce, 32, NONCE)) {
    return fail('invalid_review_fields');
  }
  if (p.issuer !== trustStore.issuer) return fail('issuer_mismatch');
  if (!COMMIT.test(expectedSourceCommit || '') ||
      !GIT_BLOB_SHA1.test(expectedSourceBlobSha1 || '') || /^0{40}$/i.test(expectedSourceBlobSha1 || '') ||
      !SHA256.test(expectedArtifactSha256 || '') ||
      p.source_commit.toLowerCase() !== expectedSourceCommit.toLowerCase() ||
      p.source_blob_sha1.toLowerCase() !== expectedSourceBlobSha1.toLowerCase() ||
      p.artifact_sha256.toLowerCase() !== expectedArtifactSha256.toLowerCase()) {
    return fail('review_target_mismatch');
  }

  const reviewedAt = Date.parse(p.reviewed_at);
  const expiresAt = Date.parse(p.expires_at);
  if (!Number.isFinite(now) || reviewedAt > now || expiresAt <= now ||
      expiresAt <= reviewedAt || now - reviewedAt > MAX_REVIEW_AGE_MS ||
      expiresAt - reviewedAt > MAX_REVIEW_TTL_MS) {
    return fail('review_expired_or_not_current');
  }

  const subjects = new Set();
  let selected = null;
  for (const reviewer of trustStore.reviewers) {
    if (!exactKeys(reviewer, REVIEWER_KEYS) ||
        !isSafeIdentityLabel(reviewer.subject) ||
        !Array.isArray(reviewer.roles) || reviewer.roles.length < 1 || reviewer.roles.length > 16 ||
        reviewer.roles.some(role => typeof role !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(role)) ||
        new Set(reviewer.roles).size !== reviewer.roles.length ||
        typeof reviewer.active !== 'boolean' ||
        typeof reviewer.public_key_pem !== 'string') {
      return fail('invalid_trust_store_reviewer');
    }
    if (subjects.has(reviewer.subject)) return fail('duplicate_trust_store_subject');
    subjects.add(reviewer.subject);
    if (reviewer.subject === p.subject) selected = reviewer;
  }
  if (!selected || selected.active !== true) return fail('reviewer_not_trusted');
  if (!selected.roles.includes('preview-reviewer')) return fail('reviewer_not_authorized');

  let publicKey;
  try {
    publicKey = crypto.createPublicKey(selected.public_key_pem);
  } catch {
    return fail('invalid_reviewer_public_key');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') return fail('reviewer_key_must_be_ed25519');
  // Node's PEM parser may ignore trailing blocks or text. Require the exact
  // canonical SPKI encoding so a pinned trust-store entry has one key value.
  if (publicKey.export({ type: 'spki', format: 'pem' }) !== selected.public_key_pem) {
    return fail('reviewer_public_key_not_canonical_spki');
  }

  const signature = decodeCanonicalBase64url(attestation.signature, 64, SIGNATURE);
  if (!signature) return fail('invalid_signature_encoding');
  let signatureValid = false;
  try {
    signatureValid = crypto.verify(
      null,
      Buffer.from(canonicalizePayload(p), 'utf8'),
      publicKey,
      signature
    );
  } catch {
    return fail('invalid_signature');
  }
  if (!signatureValid) return fail('invalid_signature');

  return Object.freeze({
    verified: true,
    issuer: p.issuer,
    subject: p.subject,
    reviewId: p.review_id,
    reviewedAt: p.reviewed_at,
    expiresAt: p.expires_at,
    sourceCommit: p.source_commit.toLowerCase(),
    sourceBlobSha1: p.source_blob_sha1.toLowerCase(),
    artifactSha256: p.artifact_sha256.toLowerCase()
  });
}

module.exports = { verifyHumanReviewAttestation, canonicalizePayload };
