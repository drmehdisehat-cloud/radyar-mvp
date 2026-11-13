'use strict';

const crypto = require('node:crypto');

const SCHEMA = 'dadyar-human-review-attestation-v1';
const POLICY = 'dadyar-preview-human-review-v1';
const PAYLOAD_KEYS = [
  'schema',
  'policyId',
  'keyId',
  'reviewerId',
  'decision',
  'sourceCommit',
  'artifactSha256',
  'reportSha256',
  'reviewedAt',
  'nonce'
];

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(label + ' must be an object.');
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new TypeError(label + ' has missing or unexpected fields.');
  }
}

function canonicalizeReviewPayload(payload) {
  exactKeys(payload, PAYLOAD_KEYS, 'Review payload');
  if (payload.schema !== SCHEMA) throw new TypeError('Unsupported review attestation schema.');
  if (payload.policyId !== POLICY) throw new TypeError('Unsupported review policy.');
  if (typeof payload.keyId !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(payload.keyId)) {
    throw new TypeError('Invalid reviewer key identifier.');
  }
  if (typeof payload.reviewerId !== 'string' || !/^[A-Za-z0-9._:-]{3,80}$/.test(payload.reviewerId)) {
    throw new TypeError('Invalid opaque reviewer identifier.');
  }
  if (!['approved', 'rejected'].includes(payload.decision)) {
    throw new TypeError('Review decision must be approved or rejected.');
  }
  if (typeof payload.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(payload.sourceCommit)) {
    throw new TypeError('Invalid source commit SHA.');
  }
  for (const field of ['artifactSha256', 'reportSha256']) {
    if (typeof payload[field] !== 'string' || !/^[a-f0-9]{64}$/.test(payload[field])) {
      throw new TypeError('Invalid ' + field + '.');
    }
  }
  if (typeof payload.reviewedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(payload.reviewedAt) ||
      new Date(payload.reviewedAt).toISOString() !== payload.reviewedAt) {
    throw new TypeError('Review timestamp must be canonical UTC ISO-8601.');
  }
  if (typeof payload.nonce !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(payload.nonce) ||
      Buffer.from(payload.nonce, 'base64url').length !== 16 ||
      Buffer.from(payload.nonce, 'base64url').toString('base64url') !== payload.nonce) {
    throw new TypeError('Review nonce must be 16 random bytes encoded as base64url.');
  }

  const ordered = {};
  for (const key of PAYLOAD_KEYS) ordered[key] = payload[key];
  return JSON.stringify(ordered);
}

function verifyReviewAttestation(envelope, options = {}) {
  exactKeys(envelope, ['payload', 'signature'], 'Review envelope');
  const canonical = canonicalizeReviewPayload(envelope.payload);
  if (typeof envelope.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(envelope.signature)) {
    throw new TypeError('Review signature must be a 64-byte base64url Ed25519 signature.');
  }
  const signature = Buffer.from(envelope.signature, 'base64url');
  if (signature.length !== 64 || signature.toString('base64url') !== envelope.signature) {
    throw new TypeError('Malformed review signature.');
  }

  const { trustedKeys, expected, now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000, futureSkewMs = 5 * 60 * 1000 } = options;
  if (!trustedKeys || typeof trustedKeys !== 'object' || Array.isArray(trustedKeys)) {
    throw new TypeError('An explicit trusted reviewer-key map is required.');
  }
  exactKeys(expected, ['sourceCommit', 'artifactSha256', 'reportSha256', 'reviewerId'], 'Expected review binding');
  for (const field of ['sourceCommit', 'artifactSha256', 'reportSha256', 'reviewerId']) {
    if (envelope.payload[field] !== expected[field]) throw new Error('Review attestation does not match expected ' + field + '.');
  }
  if (envelope.payload.decision !== 'approved') throw new Error('Rejected review cannot authorize report release.');

  const reviewedAt = Date.parse(envelope.payload.reviewedAt);
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0 ||
      !Number.isFinite(futureSkewMs) || futureSkewMs < 0) {
    throw new TypeError('Invalid verifier clock or time-window configuration.');
  }
  if (reviewedAt > now + futureSkewMs) throw new Error('Review attestation timestamp is in the future.');
  if (now - reviewedAt > maxAgeMs) throw new Error('Review attestation has expired.');

  const pem = trustedKeys[envelope.payload.keyId];
  if (typeof pem !== 'string' || !pem.trim()) throw new Error('Reviewer signing key is not trusted.');
  let publicKey;
  try {
    publicKey = crypto.createPublicKey(pem);
  } catch {
    throw new TypeError('Trusted reviewer public key is invalid.');
  }
  if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') {
    throw new TypeError('Trusted reviewer key must be Ed25519.');
  }
  if (!crypto.verify(null, Buffer.from(canonical, 'utf8'), publicKey, signature)) {
    throw new Error('Review attestation signature verification failed.');
  }

  return {
    verified: true,
    decision: 'approved',
    keyId: envelope.payload.keyId,
    reviewerId: envelope.payload.reviewerId,
    reviewedAt: envelope.payload.reviewedAt,
    sourceCommit: envelope.payload.sourceCommit,
    artifactSha256: envelope.payload.artifactSha256,
    reportSha256: envelope.payload.reportSha256
  };
}

module.exports = { SCHEMA, POLICY, canonicalizeReviewPayload, verifyReviewAttestation };
