'use strict';

// Composition root for an owner-configured, signed human-review report route.
// It creates no listener, reads no environment variables and performs no deploy.
const { createOidcReviewerAuthenticator } = require('./oidc-reviewer-authenticator.cjs');
const { createSignedReviewReleaseGate } = require('./signed-review-release-gate.cjs');
const { createReviewReleaseHttpHandler } = require('./review-release-http-handler.cjs');

function createConfiguredReviewReleaseHandler(options = {}) {
  const {
    identityProvider,
    allowedOrigin,
    trustStore,
    expectedSourceCommit,
    expectedSourceBlobSha1,
    expectedArtifactSha256,
    ledgerDirectory,
    loadReviewedReport,
    now,
    maxReportBytes = 262144,
    routePath,
    maxBodyBytes,
    bodyTimeoutMs
  } = options;

  const authenticateReviewer = createOidcReviewerAuthenticator(identityProvider);
  const releaseReviewedReport = createSignedReviewReleaseGate({
    authenticateReviewer,
    trustStore,
    expectedSourceCommit,
    expectedSourceBlobSha1,
    expectedArtifactSha256,
    ledgerDirectory,
    loadReviewedReport,
    now,
    maxReportBytes
  });

  return createReviewReleaseHttpHandler({
    allowedOrigin,
    releaseReviewedReport,
    routePath,
    maxBodyBytes,
    maxReportBytes,
    bodyTimeoutMs
  });
}

module.exports = { createConfiguredReviewReleaseHandler };
