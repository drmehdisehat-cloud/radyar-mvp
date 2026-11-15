'use strict';
// Regression tests for the read-only public preview verifier.
// Synthetic responses only; no network request or deployment is performed.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  verifyPreviewResponse,
  sha256,
  gitBlobSha1
} = require('../scripts/verify-public-preview-http.cjs');

const STRICT_HEADER_CSP = "default-src 'none'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'";
const STRICT_META_CSP = "default-src 'none'; connect-src 'none'; form-action 'none'";

function fixture({
  responseCsp = STRICT_HEADER_CSP,
  responseCspValues,
  metaPolicies = [STRICT_META_CSP]
} = {}) {
  const meta = [
    '<meta name="robots" content="noindex,nofollow">',
    '<meta name="referrer" content="no-referrer">',
    ...metaPolicies.map(policy =>
      '<meta http-equiv="Content-Security-Policy" content="' + policy + '">')
  ].join('');
  const body = Buffer.from(meta, 'utf8');
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
    'content-security-policy': responseCspValues === undefined
      ? responseCsp
      : responseCspValues
  };
  return {
    statusCode: 200,
    headers,
    body,
    expectedSha256: sha256(body),
    expectedGitBlobSha1: gitBlobSha1(body)
  };
}

test('accepts one unambiguous restrictive HTTP and meta CSP policy', () => {
  assert.equal(verifyPreviewResponse(fixture()).verified, true);
});

test('rejects duplicate connect-src where a permissive directive appears first', () => {
  const responseCsp = "default-src 'none'; connect-src https:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ responseCsp })),
    /preview_csp_duplicate_directive:connect-src/
  );
});

test('rejects duplicate frame-ancestors where a permissive directive appears first', () => {
  const responseCsp = "default-src 'none'; connect-src 'none'; form-action 'none'; frame-ancestors https://attacker.example; frame-ancestors 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ responseCsp })),
    /preview_csp_duplicate_directive:frame-ancestors/
  );
});

test('rejects duplicate default-src in the meta policy', () => {
  const metaPolicy = "default-src https:; default-src 'none'; connect-src 'none'; form-action 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ metaPolicies: [metaPolicy] })),
    /preview_csp_duplicate_directive:default-src/
  );
});

test('rejects a response that combines multiple CSP header values', () => {
  assert.throws(
    () => verifyPreviewResponse(fixture({
      responseCspValues: [STRICT_HEADER_CSP, STRICT_HEADER_CSP]
    })),
    /preview_csp_header_ambiguous/
  );
});

test('rejects a coalesced CSP header with comma-separated policies', () => {
  assert.throws(
    () => verifyPreviewResponse(fixture({
      responseCsp: STRICT_HEADER_CSP + ', ' + STRICT_HEADER_CSP
    })),
    /preview_csp_header_ambiguous/
  );
});

test('rejects multiple CSP meta elements instead of silently reading only the first', () => {
  assert.throws(
    () => verifyPreviewResponse(fixture({
      metaPolicies: [STRICT_META_CSP, STRICT_META_CSP]
    })),
    /preview_meta_csp_count_invalid/
  );
});

test('rejects a permissive single connect-src directive', () => {
  const responseCsp = "default-src 'none'; connect-src https:; form-action 'none'; frame-ancestors 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ responseCsp })),
    /preview_csp_not_restrictive:connect-src/
  );
});
