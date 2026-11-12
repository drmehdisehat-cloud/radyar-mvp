'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  fetchPreview,
  verifyPreviewResponse,
  verifyTargetUrl,
  sha256,
  gitBlobSha1
} = require('../scripts/verify-public-preview-http.cjs');

const html = [
  '<!doctype html>',
  '<html lang="fa" dir="rtl"><head>',
  '<meta charset="utf-8">',
  '<meta name="robots" content="noindex,nofollow,noarchive">',
  '<meta name="referrer" content="no-referrer">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'; form-action \'none\'">',
  '</head><body><main>پیش‌نمایش ساختگی دادیار</main></body></html>'
].join('');
const body = Buffer.from(html, 'utf8');
const expectedSha256 = sha256(body);
const expectedGitBlobSha1 = gitBlobSha1(body);
const headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};

function verify(overrides = {}) {
  return verifyPreviewResponse({
    statusCode: 200,
    headers: { ...headers },
    body,
    expectedSha256,
    expectedGitBlobSha1,
    ...overrides
  });
}

test('accepts only the canonical HTTPS preview subpath', () => {
  const url = verifyTargetUrl('https://mehdisehat.ir/dadyar-preview/');
  assert.equal(url.hostname, 'mehdisehat.ir');
  assert.equal(url.pathname, '/dadyar-preview/');
  for (const value of [
    'http://mehdisehat.ir/dadyar-preview/',
    'https://www.mehdisehat.ir/dadyar-preview/',
    'https://mehdisehat.ir/',
    'https://mehdisehat.ir/dadyar-preview',
    'https://mehdisehat.ir/dadyar-preview/?x=1',
    'https://mehdisehat.ir/dadyar-preview/#top',
    'https://user:pass@mehdisehat.ir/dadyar-preview/',
    'https://mehdisehat.ir:8443/dadyar-preview/'
  ]) assert.throws(() => verifyTargetUrl(value), /preview_url_must_be_exact_canonical_https_subpath/);
});

test('accepts the exact reviewed body with offline and indexing protections', () => {
  const result = verify();
  assert.equal(result.verified, true);
  assert.equal(result.deploymentPerformed, false);
  assert.equal(result.method, 'GET');
  assert.equal(result.noindex, true);
  assert.equal(result.nofollow, true);
  assert.equal(result.noReferrer, true);
  assert.equal(result.connectSrcNone, true);
  assert.equal(result.cookiesSet, false);
  assert.equal(result.sha256, expectedSha256);
  assert.equal(result.gitBlobSha1, expectedGitBlobSha1);
});

test('rejects redirects and every non-200 status without following Location', () => {
  assert.throws(() => verify({ statusCode: 302, headers: { ...headers, location: 'https://example.test/' } }), /preview_http_status_must_be_200/);
  assert.throws(() => verify({ statusCode: 404 }), /preview_http_status_must_be_200/);
});

test('rejects body tampering even when response headers look safe', () => {
  assert.throws(() => verify({ body: Buffer.from(html + '<!-- changed -->') }), /preview_sha256_does_not_match_reviewed_source/);
});

test('rejects a mismatched Git blob pin independently of the SHA-256 pin', () => {
  assert.throws(() => verify({ expectedGitBlobSha1: 'a'.repeat(40) }), /preview_git_blob_sha1_does_not_match_reviewed_source/);
});

test('requires HTML content type, nosniff and no cookies', () => {
  assert.throws(() => verify({ headers: { ...headers, 'content-type': 'text/plain' } }), /preview_content_type_must_be_html/);
  assert.throws(() => verify({ headers: { 'content-type': headers['content-type'] } }), /preview_missing_nosniff_header/);
  assert.throws(() => verify({ headers: { ...headers, 'set-cookie': ['session=fake'] } }), /static_preview_must_not_set_cookies/);
});

test('requires noindex, nofollow, no-referrer and a restrictive CSP', () => {
  const withoutRobots = Buffer.from(html.replace('noindex,nofollow,noarchive', 'index,follow'));
  assert.throws(() => verify({ body: withoutRobots }), /preview_must_be_noindex_nofollow/);
  const withoutReferrer = Buffer.from(html.replace('content="no-referrer"', 'content="origin"'));
  assert.throws(() => verify({ body: withoutReferrer }), /preview_must_disable_referrer/);
  const withoutCsp = Buffer.from(html.replace("connect-src 'none'; ", ''));
  assert.throws(() => verify({ body: withoutCsp }), /preview_csp_missing:connect-src 'none'/);
});

test('requires response-header frame protection; a meta CSP cannot supply frame-ancestors', () => {
  const withoutHeader = { ...headers };
  delete withoutHeader['content-security-policy'];
  assert.throws(() => verify({ headers: withoutHeader }), /preview_missing_http_csp_header/);

  const withoutFrameAncestors = {
    ...headers,
    'content-security-policy': "default-src 'none'; connect-src 'none'; form-action 'none'"
  };
  assert.throws(() => verify({ headers: withoutFrameAncestors }), /preview_http_csp_missing:frame-ancestors/);
});

test('requires no-store, X-Frame-Options, CORP and restrictive Permissions-Policy headers', () => {
  for (const [name, value, error] of [
    ['cache-control', 'public, max-age=3600', /preview_missing_no_store_header/],
    ['x-frame-options', 'SAMEORIGIN', /preview_missing_x_frame_options_deny/],
    ['cross-origin-resource-policy', 'cross-origin', /preview_missing_cross_origin_resource_policy/],
    ['permissions-policy', 'camera=(), microphone=()', /preview_permissions_policy_missing:geolocation/]
  ]) {
    assert.throws(() => verify({ headers: { ...headers, [name]: value } }), error);
  }
});

test('rejects empty, oversized, invalid UTF-8 and missing hash pins', () => {
  assert.throws(() => verify({ body: Buffer.alloc(0) }), /preview_body_empty_or_too_large/);
  assert.throws(() => verify({ body: Buffer.alloc(1024 * 1024 + 1, 0x61) }), /preview_body_empty_or_too_large/);
  assert.throws(() => verify({ body: Buffer.from([0xc3, 0x28]) }), /preview_body_must_be_valid_utf8/);
  assert.throws(() => verify({ expectedSha256: '' }), /pinned_sha256_and_git_blob_sha1_required/);
});

test('live probe performs one credential-free GET and validates the returned response', async () => {
  let seen;
  const request = (url, options, callback) => {
    seen = { url: String(url), options };
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.destroy = error => req.emit('error', error);
    req.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { ...headers };
      response.destroy = error => response.emit('error', error);
      callback(response);
      queueMicrotask(() => {
        response.emit('data', body);
        response.emit('end');
      });
    };
    return req;
  };
  const result = await fetchPreview(
    'https://mehdisehat.ir/dadyar-preview/',
    expectedSha256,
    expectedGitBlobSha1,
    { request }
  );
  assert.equal(result.verified, true);
  assert.equal(seen.url, 'https://mehdisehat.ir/dadyar-preview/');
  assert.equal(seen.options.method, 'GET');
  assert.equal(seen.options.headers.accept, 'text/html');
  assert.equal(seen.options.headers['accept-encoding'], 'identity');
  assert.equal(Object.keys(seen.options.headers).some(key => /authorization|cookie/i.test(key)), false);
});
