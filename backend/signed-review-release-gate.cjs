'use strict';

// Composition boundary for the signed-review HTTP adapter.
// This module does not create an identity provider, trust store or report store.
// The caller must inject those trusted server-side dependencies.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { verifyHumanReviewAttestation } = require('../scripts/verify-human-review-attestation.cjs');
const {
  assertPrivateLedgerDirectory,
  consumeHumanReviewAttestation
} = require('./human-review-replay-ledger.cjs');

const COMMIT = /^[a-f0-9]{40}$/i;
const BLOB = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const DEFAULT_MAX_REPORT_BYTES = 262144;

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotTrustStore(value) {
  let snapshot;
  try {
    snapshot = JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError('A JSON-serializable owner-pinned review trust store is required.');
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('A JSON object review trust store is required.');
  }
  return deepFreeze(snapshot);
}

// A replay check is deliberately read-only. Any existing claim, including a
// partial or malformed claim, fails closed before the report store is touched.
// The directory descriptor pins the private ledger directory during inspection.
function hasReplayClaim({ envelope, ledgerDirectory }) {
  const payload = envelope.payload;
  const reviewIdHash = crypto.createHash('sha256')
    .update(payload.issuer + '\0' + payload.review_id, 'utf8').digest('hex');
  const nonceHash = crypto.createHash('sha256')
    .update(payload.issuer + '\0' + payload.nonce, 'utf8').digest('hex');
  const names = [
    'review-' + reviewIdHash + '.json',
    'nonce-' + nonceHash + '.json'
  ];

  const directory = assertPrivateLedgerDirectory(ledgerDirectory);
  try {
    let found = false;
    for (const name of names) {
      try {
        // Presence alone is sufficient to reject. Do not follow or read a
        // marker: a symlink or malformed marker must also fail closed.
        fs.lstatSync(path.join(directory.real, name), { bigint: true });
        found = true;
        break;
      } catch (error) {
        if (error && error.code === 'ENOENT') continue;
        throw error;
      }
    }

    const current = fs.statSync(directory.real, { bigint: true });
    const opened = fs.fstatSync(directory.dirFd, { bigint: true });
    if (!current.isDirectory() || !opened.isDirectory() ||
        current.dev !== directory.dev || current.ino !== directory.ino ||
        opened.dev !== directory.dev || opened.ino !== directory.ino) {
      throw new Error('ledger_directory_identity_changed');
    }
    return found;
  } finally {
    try { fs.closeSync(directory.dirFd); } catch {}
  }
}

function createSignedReviewReleaseGate(options = {}) {
  const {
    authenticateReviewer,
    trustStore,
    expectedSourceCommit,
    expectedSourceBlobSha1,
    expectedArtifactSha256,
    ledgerDirectory,
    loadReviewedReport,
    now = Date.now,
    maxReportBytes = DEFAULT_MAX_REPORT_BYTES
  } = options;

  if (typeof authenticateReviewer !== 'function') {
    throw new TypeError('A trusted server-side authenticateReviewer function is required.');
  }
  if (typeof loadReviewedReport !== 'function') {
    throw new TypeError('A server-side loadReviewedReport function is required.');
  }
  if (!COMMIT.test(expectedSourceCommit || '') || /^0{40}$/i.test(expectedSourceCommit || '')) {
    throw new TypeError('A non-zero reviewed source commit SHA is required.');
  }
  if (!BLOB.test(expectedSourceBlobSha1 || '') || /^0{40}$/i.test(expectedSourceBlobSha1 || '')) {
    throw new TypeError('A non-zero reviewed source Git blob SHA-1 is required.');
  }
  if (!SHA256.test(expectedArtifactSha256 || '') || /^0{64}$/i.test(expectedArtifactSha256 || '')) {
    throw new TypeError('A non-zero reviewed artifact SHA-256 is required.');
  }
  if (typeof ledgerDirectory !== 'string' || !ledgerDirectory || !path.isAbsolute(ledgerDirectory)) {
    throw new TypeError('An absolute external replay-ledger directory is required.');
  }
  if (typeof now !== 'function') throw new TypeError('The clock must be a function.');
  if (!Number.isSafeInteger(maxReportBytes) || maxReportBytes < 1 || maxReportBytes > 1048576) {
    throw new TypeError('maxReportBytes must be an integer between 1 and 1048576.');
  }

  const pinnedTrustStore = snapshotTrustStore(trustStore);
  const target = Object.freeze({
    sourceCommit: expectedSourceCommit.toLowerCase(),
    sourceBlobSha1: expectedSourceBlobSha1.toLowerCase(),
    artifactSha256: expectedArtifactSha256.toLowerCase()
  });
  // Prevent duplicate in-process requests from reading the report concurrently.
  // The durable ledger remains authoritative across process restarts.
  const inFlightReviews = new Set();

  return async function releaseReviewedReport({ request, envelope } = {}) {
    // Authentication is obtained only from the trusted server-side adapter.
    // No reviewer identity, role or independence flag is read from the body.
    let principal;
    try {
      principal = await authenticateReviewer(request);
    } catch {
      throw failure('AUTHENTICATED_REVIEWER_REQUIRED');
    }
    if (!principal || principal.authenticated !== true) {
      throw failure('AUTHENTICATED_REVIEWER_REQUIRED');
    }
    if (principal.independent !== true ||
        !Array.isArray(principal.roles) ||
        principal.roles.length !== 1 ||
        principal.roles[0] !== 'preview-reviewer' ||
        typeof principal.issuer !== 'string' ||
        principal.issuer !== pinnedTrustStore.issuer ||
        typeof principal.subject !== 'string' ||
        !principal.subject) {
      throw failure('REVIEW_ATTESTATION_REJECTED');
    }

    const checkedAt = now();
    if (!Number.isFinite(checkedAt)) throw failure('REVIEW_RELEASE_UNAVAILABLE');

    let verification;
    try {
      verification = verifyHumanReviewAttestation({
        attestation: envelope,
        trustStore: pinnedTrustStore,
        expectedSourceCommit: target.sourceCommit,
        expectedSourceBlobSha1: target.sourceBlobSha1,
        expectedArtifactSha256: target.artifactSha256,
        now: checkedAt
      });
    } catch {
      throw failure('REVIEW_ATTESTATION_REJECTED');
    }
    if (!verification.verified ||
        verification.issuer !== principal.issuer ||
        verification.subject !== principal.subject) {
      throw failure('REVIEW_ATTESTATION_REJECTED');
    }

    const payload = envelope.payload;
    const attemptKey = crypto.createHash('sha256')
      .update(payload.issuer + '\0' + payload.review_id + '\0' + payload.nonce, 'utf8')
      .digest('hex');
    if (inFlightReviews.has(attemptKey)) {
      throw failure('REVIEW_ATTESTATION_REJECTED');
    }
    inFlightReviews.add(attemptKey);

    try {
      // Reject a previously consumed attestation before reading report storage.
      // A read-only precheck preserves retryability if report storage is down;
      // the transactional consume below remains the final race-safe authority.
      let replayed;
      try {
        replayed = hasReplayClaim({ envelope, ledgerDirectory });
      } catch {
        throw failure('REVIEW_RELEASE_UNAVAILABLE');
      }
      if (replayed) throw failure('REVIEW_ATTESTATION_REJECTED');

      let loaded;
      try {
        loaded = await loadReviewedReport(target);
      } catch {
        throw failure('REVIEW_RELEASE_UNAVAILABLE');
      }
      if ((!Buffer.isBuffer(loaded) && !(loaded instanceof Uint8Array)) ||
          loaded.byteLength < 1 || loaded.byteLength > maxReportBytes) {
        throw failure('REVIEW_RELEASE_UNAVAILABLE');
      }
      const reportBytes = Buffer.from(loaded);
      const actualDigest = crypto.createHash('sha256').update(reportBytes).digest('hex');
      if (actualDigest !== target.artifactSha256) {
        throw failure('REVIEW_RELEASE_UNAVAILABLE');
      }

      const consumed = consumeHumanReviewAttestation({
        attestation: envelope,
        trustStore: pinnedTrustStore,
        expectedSourceCommit: target.sourceCommit,
        expectedSourceBlobSha1: target.sourceBlobSha1,
        expectedArtifactSha256: target.artifactSha256,
        ledgerDirectory,
        now: checkedAt
      });
      if (!consumed || consumed.consumed !== true) {
        if (consumed?.reason === 'replay_ledger_unavailable' ||
            consumed?.reason === 'replay_ledger_busy') {
          throw failure('REVIEW_RELEASE_UNAVAILABLE');
        }
        throw failure('REVIEW_ATTESTATION_REJECTED');
      }

      return Object.freeze({ reportBytes });
    } finally {
      inFlightReviews.delete(attemptKey);
    }
  };
}

module.exports = { createSignedReviewReleaseGate, hasReplayClaim };
