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

const INLINE_STYLE = 'body{color:black}';
const INLINE_SCRIPT = 'void 0;';
const STYLE_HASH = "'sha256-" + require('node:crypto').createHash('sha256').update(INLINE_STYLE, 'utf8').digest('base64') + "'";
const SCRIPT_HASH = "'sha256-" + require('node:crypto').createHash('sha256').update(INLINE_SCRIPT, 'utf8').digest('base64') + "'";
const STRICT_HEADER_CSP = "default-src 'none'; script-src " + SCRIPT_HASH + "; style-src " + STYLE_HASH + "; connect-src 'none'; form-action 'none'; frame-ancestors 'none'";
const STRICT_META_CSP = "default-src 'none'; script-src " + SCRIPT_HASH + "; style-src " + STYLE_HASH + "; connect-src 'none'; form-action 'none'";
const NO_NETWORK_CSP_DIRECTIVES = [
  ['img-src', "'none'"], ['font-src', "'none'"], ['object-src', "'none'"],
  ['frame-src', "'none'"], ['media-src', "'none'"], ['manifest-src', "'none'"],
  ['worker-src', "'none'"], ['child-src', "'none'"], ['prefetch-src', "'none'"],
  ['base-uri', "'none'"]
];
function completeCsp(policy) {
  const existing = new Set(policy.split(';')
    .map(part => part.trim().split(/\s+/, 1)[0].toLowerCase())
    .filter(Boolean));
  const additions = NO_NETWORK_CSP_DIRECTIVES
    .filter(([name]) => !existing.has(name))
    .map(([name, value]) => name + ' ' + value);
  return [policy.trim().replace(/;+\s*$/, ''), ...additions].join('; ');
}

function fixture({
  responseCsp = STRICT_HEADER_CSP,
  responseCspValues,
  metaPolicies = [STRICT_META_CSP]
} = {}) {
  const meta = [
    '<meta name="robots" content="noindex,nofollow">',
    '<meta name="referrer" content="no-referrer">',
    ...metaPolicies.map(policy =>
      '<meta http-equiv="Content-Security-Policy" content="' + completeCsp(policy) + '">')
  ].join('');
  const body = Buffer.from(meta + '<style>' + INLINE_STYLE + '</style><script>' + INLINE_SCRIPT + '</script>', 'utf8');
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
      ? completeCsp(responseCsp)
      : Array.isArray(responseCspValues)
        ? responseCspValues.map(completeCsp)
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

test('accepts one unambiguous restrictive HTTP and meta CSP policy with exact inline hashes', () => {
  assert.equal(verifyPreviewResponse(fixture()).verified, true);
});

test('rejects duplicate connect-src where a permissive directive appears first', () => {
  const responseCsp = "default-src 'none'; script-src " + SCRIPT_HASH + "; style-src " + STYLE_HASH + "; connect-src https:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ responseCsp })),
    /preview_csp_duplicate_directive:connect-src/
  );
});

test('rejects duplicate frame-ancestors where a permissive directive appears first', () => {
  const responseCsp = "default-src 'none'; script-src " + SCRIPT_HASH + "; style-src " + STYLE_HASH + "; connect-src 'none'; form-action 'none'; frame-ancestors https://attacker.example; frame-ancestors 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ responseCsp })),
    /preview_csp_duplicate_directive:frame-ancestors/
  );
});

test('rejects duplicate default-src in the meta policy', () => {
  const metaPolicy = "default-src https:; default-src 'none'; script-src " + SCRIPT_HASH + "; style-src " + STYLE_HASH + "; connect-src 'none'; form-action 'none'";
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

test('rejects duplicate case-insensitive CSP header keys', () => {
  const value = fixture();
  value.headers['Content-Security-Policy'] = STRICT_HEADER_CSP;
  assert.throws(
    () => verifyPreviewResponse(value),
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
  const responseCsp = "default-src 'none'; script-src " + SCRIPT_HASH + "; style-src " + STYLE_HASH + "; connect-src https:; form-action 'none'; frame-ancestors 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ responseCsp })),
    /preview_csp_not_restrictive:connect-src/
  );
});

test('rejects a permissive script-src in the meta policy', () => {
  const metaPolicy = "default-src 'none'; script-src https:; style-src " + STYLE_HASH + "; connect-src 'none'; form-action 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ metaPolicies: [metaPolicy] })),
    /preview_csp_not_restrictive:script-src/
  );
});

test('rejects duplicate script-src even when the exact inline hash appears later', () => {
  const metaPolicy = "default-src 'none'; script-src https:; script-src " + SCRIPT_HASH + "; style-src " + STYLE_HASH + "; connect-src 'none'; form-action 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ metaPolicies: [metaPolicy] })),
    /preview_csp_duplicate_directive:script-src/
  );
});

test('rejects a permissive style-src in the HTTP response policy', () => {
  const responseCsp = "default-src 'none'; script-src " + SCRIPT_HASH + "; style-src https:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ responseCsp })),
    /preview_csp_not_restrictive:style-src/
  );
});

test('rejects script-src-elem overrides that bypass the exact script hash', () => {
  const metaPolicy = STRICT_META_CSP + '; script-src-elem https:';
  assert.throws(
    () => verifyPreviewResponse(fixture({ metaPolicies: [metaPolicy] })),
    /preview_csp_not_restrictive:script-src-elem/
  );
});

test('rejects style-src-attr overrides that allow inline style attributes', () => {
  const metaPolicy = STRICT_META_CSP + "; style-src-attr 'unsafe-inline'";
  assert.throws(
    () => verifyPreviewResponse(fixture({ metaPolicies: [metaPolicy] })),
    /preview_csp_not_restrictive:style-src-attr/
  );
});
