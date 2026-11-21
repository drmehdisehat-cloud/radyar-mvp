'use strict';

// Composition factory for the signed-review HTTP boundary.
// This creates a loopback-only server. It does not provide an IdP, trust store,
// durable shared nonce store, TLS termination, deployment or public API route.
const { createSignedReviewReleaseGate } = require('./signed-review-release-gate.cjs');
const {
  createReviewReleaseHttpHandler,
  createReviewReleaseHttpServer
} = require('./review-release-http-handler.cjs');

function createSignedReviewReleaseHttpServer(options = {}) {
  const {
    allowedOrigin,
    routePath,
    maxBodyBytes,
    maxReportBytes,
    bodyTimeoutMs,
    ...gateOptions
  } = options;

  // Keep the report-size ceiling identical at both the cryptographic gate and
  // HTTP response boundary. The gate authenticates first, verifies the signed
  // target, loads exact server-side bytes, checks their digest, then consumes
  // the one-shot nonce before the HTTP adapter can return those bytes.
  const releaseReviewedReport = createSignedReviewReleaseGate({
    ...gateOptions,
    maxReportBytes
  });

  const handler = createReviewReleaseHttpHandler({
    releaseReviewedReport,
    allowedOrigin,
    routePath,
    maxBodyBytes,
    maxReportBytes,
    bodyTimeoutMs
  });

  return createReviewReleaseHttpServer(handler);
}

module.exports = { createSignedReviewReleaseHttpServer };
