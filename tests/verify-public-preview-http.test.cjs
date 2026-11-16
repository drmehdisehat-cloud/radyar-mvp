'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const {
  fetchPreview,
  verifyPreviewResponse,
  verifyTargetUrl,
  sha256,
  gitBlobSha1
} = require('../scripts/verify-public-preview-http.cjs');

const inlineStyle = 'body{font-family:system-ui}';
const inlineScript = "document.documentElement.dataset.ready='yes';";
function cspHash(source) {
  return "'sha256-" + crypto.createHash('sha256').update(source, 'utf8').digest('base64') + "'";
}
const metaPolicy = "default-src 'none'; script-src " + cspHash(inlineScript) +
  '; style-src ' + cspHash(inlineStyle) + "; connect-src 'none'; img-src 'none'; font-src 'none'; " +
  "object-src 'none'; frame-src 'none'; media-src 'none'; manifest-src 'none'; worker-src 'none'; " +
  "child-src 'none'; prefetch-src 'none'; form-action 'none'; base-uri 'none'";
const html = [
  '<!doctype html>',
  '<html lang="fa" dir="rtl"><head>',
  '<meta charset="utf-8">',
  '<meta name="robots" content="noindex,nofollow,noarchive">',
  '<meta name="referrer" content="no-referrer">',
  '<meta http-equiv="Content-Security-Policy" content="' + metaPolicy + '">',
  '</head><body><main>پیش‌نمایش ساختگی دادیار</main>',
  '<style>' + inlineStyle + '</style>',
  '<script>' + inlineScript + '</script>',
  '</body></html>'
].join('');
const body = Buffer.from(html, 'utf8');
const expectedSha256 = sha256(body);
const expectedGitBlobSha1 = gitBlobSha1(body);
const headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': metaPolicy + "; frame-ancestors 'none'",
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

function replaceCspDirective(policy, name, value) {
  const parts = policy.split(';').map(part => part.trim()).filter(Boolean);
  let matches = 0;
  const updated = parts.map(part => {
    const match = /^([a-z][a-z0-9-]*)\\s+(.+)$/i.exec(part);
    if (match && match[1].toLowerCase() === name) {
      matches++;
      return match[1] + ' ' + value;
    }
    return part;
  });
  assert.equal(matches, 1, 'fixture must contain exactly one ' + name + ' directive');
  return updated.join('; ');
}
function removeCspDirective(policy, name) {
  const parts = policy.split(';').map(part => part.trim()).filter(Boolean);
  const filtered = parts.filter(part => !part.split(/\\s+/, 1)[0].toLowerCase().includes(name) ||
    part.split(/\\s+/, 1)[0].toLowerCase() !== name);
  assert.equal(filtered.length, parts.length - 1, 'fixture must contain exactly one ' + name + ' directive');
  return filtered.join('; ');
}
function verifyCandidate(candidateHtml, responsePolicy = headers['content-security-policy']) {
  const candidateBody = Buffer.from(candidateHtml, 'utf8');
  return verify({
    body: candidateBody,
    expectedSha256: sha256(candidateBody),
    expectedGitBlobSha1: gitBlobSha1(candidateBody),
    headers: { ...headers, 'content-security-policy': responsePolicy }
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
  assert.equal(result.restrictedPermissionsPolicy, true);
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
  assert.throws(() => verify({ body: withoutCsp }), /preview_meta_csp_missing:connect-src/);
});

test('requires response-header frame protection; a meta CSP cannot supply frame-ancestors', () => {
  const withoutHeader = { ...headers };
  delete withoutHeader['content-security-policy'];
  assert.throws(() => verify({ headers: withoutHeader }), /preview_missing_http_csp_header/);

  const withoutFrameAncestors = {
    ...headers,
    'content-security-policy': metaPolicy
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

test('rejects duplicate or permissive camera, microphone and geolocation directives', () => {
  for (const value of [
    'camera=(), camera=(self), microphone=(), geolocation=()',
    'camera=(self), microphone=(), geolocation=()',
    'camera=(), microphone=(*), geolocation=()',
    'camera=(), microphone=(), geolocation=(https://example.test)'
  ]) {
    assert.throws(
      () => verify({ headers: { ...headers, 'permissions-policy': value } }),
      /preview_permissions_policy_(?:duplicate|not_restricted):/
    );
  }
  assert.throws(
    () => verify({ headers: { ...headers, 'permissions-policy': 'camera=(), microphone=(), geolocation=' } }),
    /preview_permissions_policy_invalid/
  );
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


test('rejects duplicate security response headers instead of coalescing them', () => {
  const cases = [
    ['content-type', ['text/html; charset=utf-8', 'text/plain']],
    ['x-content-type-options', ['nosniff', '']],
    ['cache-control', ['no-store', 'public, max-age=3600']],
    ['x-frame-options', ['DENY', 'SAMEORIGIN']],
    ['cross-origin-resource-policy', ['same-origin', 'cross-origin']],
    ['referrer-policy', ['no-referrer', 'unsafe-url']],
    ['x-robots-tag', ['noindex, nofollow', 'index, follow']]
  ];
  for (const [name, values] of cases) {
    assert.throws(
      () => verify({ headers: { ...headers, [name]: values } }),
      new RegExp('preview_header_ambiguous:' + name)
    );
  }
});

test('rejects a coalesced Cache-Control policy that combines no-store with public caching', () => {
  assert.throws(
    () => verify({ headers: { ...headers, 'cache-control': 'no-store, public, max-age=3600' } }),
    /preview_missing_no_store_header/
  );
});

test('rejects conflicting robots directives even when noindex and nofollow are also present', () => {
  assert.throws(
    () => verify({ headers: { ...headers, 'x-robots-tag': 'noindex, nofollow, index, follow' } }),
    /preview_must_be_noindex_nofollow/
  );
});

test('requires exactly one robots and referrer meta element', () => {
  const duplicateRobots = Buffer.from(html.replace(
    '</head>',
    '<meta name="robots" content="index,follow"></head>'
  ), 'utf8');
  assert.throws(() => verify({ body: duplicateRobots }), /preview_meta_robots_count_invalid/);

  const duplicateReferrer = Buffer.from(html.replace(
    '</head>',
    '<meta name="referrer" content="unsafe-url"></head>'
  ), 'utf8');
  assert.throws(() => verify({ body: duplicateReferrer }), /preview_meta_referrer_count_invalid/);
});

test('rejects a permissive single Referrer-Policy header despite a restrictive meta fallback', () => {
  assert.throws(
    () => verify({ headers: { ...headers, 'referrer-policy': 'unsafe-url' } }),
    /preview_must_disable_referrer/
  );
});
const noNetworkCspDirectives = [
  'img-src', 'font-src', 'object-src', 'frame-src', 'media-src',
  'manifest-src', 'worker-src', 'child-src', 'prefetch-src', 'base-uri'
];

test('requires explicit no-network resource directives in both HTTP and meta CSP policies', () => {
  for (const directive of noNetworkCspDirectives) {
    const permissiveHeader = replaceCspDirective(
      headers['content-security-policy'], directive, 'https:'
    );
    assert.throws(
      () => verifyCandidate(html, permissiveHeader),
      new RegExp('preview_csp_not_restrictive:' + directive)
    );
    const missingHeader = removeCspDirective(headers['content-security-policy'], directive);
    assert.throws(
      () => verifyCandidate(html, missingHeader),
      new RegExp('preview_http_csp_missing:' + directive)
    );

    const permissiveMeta = replaceCspDirective(metaPolicy, directive, 'https:');
    assert.throws(
      () => verifyCandidate(html.replace(metaPolicy, permissiveMeta)),
      new RegExp('preview_csp_not_restrictive:' + directive)
    );
    const missingMeta = removeCspDirective(metaPolicy, directive);
    assert.throws(
      () => verifyCandidate(html.replace(metaPolicy, missingMeta)),
      new RegExp('preview_meta_csp_missing:' + directive)
    );
  }
});

