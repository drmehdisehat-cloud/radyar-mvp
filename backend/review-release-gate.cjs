'use strict';

const crypto = require('node:crypto');
const { verifyReviewAttestation } = require('../scripts/reviewer-attestation.cjs');

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

function asBytes(value, label) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new TypeError(label + ' must be bytes from server-controlled storage.');
  }
  return Buffer.from(value);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Creates a fail-closed server-side report-release boundary.
 *
 * All identity, independence, release-material, key-registry and nonce-store
 * dependencies must be supplied by the server. This module deliberately
 * provides no HTTP route, cookie/session implementation or identity provider.
 */
function createReviewReleaseGate(options = {}) {
  const {
    authenticateReviewer,
    isIndependentReviewer,
    loadReleaseMaterial,
    trustedKeys,
    nonceStore,
    clock = Date.now,
    maxAgeMs,
    futureSkewMs
  } = options;

  if (typeof authenticateReviewer !== 'function') {
    throw new TypeError('A server-side reviewer authenticator is required.');
  }
  if (typeof isIndependentReviewer !== 'function') {
    throw new TypeError('An independent-review policy is required.');
  }
  if (typeof loadReleaseMaterial !== 'function') {
    throw new TypeError('A server-controlled release-material loader is required.');
  }
  if (!trustedKeys || typeof trustedKeys !== 'object' || Array.isArray(trustedKeys)) {
    throw new TypeError('An explicit trusted reviewer-key registry is required.');
  }
  if (!nonceStore || typeof nonceStore.consume !== 'function') {
    throw new TypeError('A durable atomic nonce store is required.');
  }
  if (typeof clock !== 'function') {
    throw new TypeError('A verifier clock function is required.');
  }

  return async function releaseReviewedReport({ request, envelope } = {}) {
    // Never accept reviewerId, artifact hashes or report hashes from the caller.
    // The principal comes only from the injected server-side authenticator.
    const principal = await authenticateReviewer(request);
    if (!principal || typeof principal.id !== 'string' ||
        !/^[A-Za-z0-9._:-]{3,80}$/.test(principal.id)) {
      throw new Error('An authenticated reviewer principal is required.');
    }

    // Apply independence policy before touching report/artifact storage. The
    // injected policy must resolve author/deployer relationships from its own
    // trusted server-side records using only the authenticated principal ID.
    if (await isIndependentReviewer({ reviewerId: principal.id }) !== true) {
      throw new Error('An independently authenticated reviewer is required.');
    }

    // Load the exact release bytes from server-controlled storage, not request
    // parameters or browser-provided content.
    const material = await loadReleaseMaterial();
    exactKeys(material, ['sourceCommit', 'artifactBytes', 'reportBytes'], 'Release material');
    if (typeof material.sourceCommit !== 'string' ||
        !/^[a-f0-9]{40}$/.test(material.sourceCommit)) {
      throw new TypeError('Release source commit must be a full Git SHA.');
    }
    const artifactBytes = asBytes(material.artifactBytes, 'Preview artifact');
    const reportBytes = asBytes(material.reportBytes, 'Reviewed report');
    const bindings = {
      sourceCommit: material.sourceCommit,
      artifactSha256: sha256(artifactBytes),
      reportSha256: sha256(reportBytes)
    };

    const verified = await verifyReviewAttestation(envelope, {
      trustedKeys,
      expected: { ...bindings, reviewerId: principal.id },
      nonceStore,
      now: clock(),
      maxAgeMs,
      futureSkewMs
    });

    if (verified.verified !== true || verified.decision !== 'approved') {
      throw new Error('A verified approval is required before report release.');
    }

    // Return a copy only after authentication, independence, exact-byte
    // binding, signature verification and one-use nonce consumption succeed.
    return Object.freeze({
      reportBytes: Buffer.from(reportBytes),
      receipt: Object.freeze(verified)
    });
  };
}

module.exports = { createReviewReleaseGate, sha256 };
