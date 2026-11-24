'use strict';
// Read-only live HTTPS probe for the dedicated Dadyar preview URL.
// This script performs one GET only. It never deploys, writes, follows redirects,
// sends credentials, or contacts an API endpoint.
const https = require('node:https');
const crypto = require('node:crypto');

const CANONICAL_HOST = 'mehdisehat.ir';
const CANONICAL_PATH = '/dadyar-preview/';
const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_BLOB_SHA1 = /^[a-f0-9]{40}$/i;

function headerValues(headers, name) {
  const wanted = String(name).toLowerCase();
  const keys = Object.keys(headers || {}).filter(candidate => candidate.toLowerCase() === wanted);
  const values = [];
  for (const key of keys) {
    const value = headers[key];
    if (value == null) continue;
    if (Array.isArray(value)) values.push(...value.map(item => String(item)));
    else values.push(String(value));
  }
  return values;
}

function singleHeader(headers, name, missingError) {
  const values = headerValues(headers, name);
  if (!values.length) {
    if (missingError) throw new Error(missingError);
    return '';
  }
  if (values.length !== 1) {
    throw new Error('preview_header_ambiguous:' + String(name).toLowerCase());
  }
  return values[0].trim();
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function cspSha256(source) {
  return crypto.createHash('sha256').update(source, 'utf8').digest('base64');
}

function gitBlobSha1(bytes) {
  const hash = crypto.createHash('sha1');
  hash.update('blob ' + bytes.length + String.fromCharCode(0));
  hash.update(bytes);
  return hash.digest('hex');
}

function verifyTargetUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('preview_url_invalid');
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== CANONICAL_HOST ||
      (url.port && url.port !== '443') || url.username || url.password ||
      url.pathname !== CANONICAL_PATH || url.search || url.hash) {
    throw new Error('preview_url_must_be_exact_canonical_https_subpath');
  }
  return url;
}

function metaNamedContents(html, name) {
  const wanted = String(name).toLowerCase();
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  const values = [];
  for (const tag of tags) {
    const nameMatch = /\bname\s*=\s*(["'])(.*?)\1/i.exec(tag);
    if (!nameMatch || nameMatch[2].toLowerCase() !== wanted) continue;
    const contentMatch = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag);
    if (!contentMatch) throw new Error('preview_meta_' + wanted + '_content_missing');
    values.push(contentMatch[2]);
  }
  return values;
}

function metaCspPolicies(html) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  const policies = [];
  for (const tag of tags) {
    if (!/\bhttp-equiv\s*=\s*(["'])Content-Security-Policy\1/i.test(tag)) continue;
    const match = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (!match) throw new Error('preview_meta_csp_content_missing');
    policies.push(match[1] === undefined ? match[2] : match[1]);
  }
  return policies;
}

function inlineBlockContent(html, tag) {
  const expression = new RegExp('<' + tag + '\\b([^>]*)>([\\s\\S]*?)</' + tag + '\\s*>', 'gi');
  const matches = [...String(html).matchAll(expression)];
  if (matches.length !== 1) throw new Error('preview_inline_' + tag + '_count_invalid');
  if (String(matches[0][1] || '').trim()) {
    throw new Error('preview_inline_' + tag + '_attributes_not_allowed');
  }
  return matches[0][2];
}

function verifyCspPolicy(policy, requiredDirectives, optionalDirectives, source) {
  if (typeof policy !== 'string' || !policy.trim()) {
    throw new Error('preview_' + source + '_csp_invalid');
  }
  const directives = new Map();
  for (const part of policy.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const name = tokens.shift().toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new Error('preview_' + source + '_csp_directive_invalid');
    }
    if (directives.has(name)) {
      throw new Error('preview_csp_duplicate_directive:' + name);
    }
    directives.set(name, tokens.join(' '));
  }
  for (const [name, expected] of requiredDirectives) {
    if (!directives.has(name)) {
      throw new Error('preview_' + source + '_csp_missing:' + name);
    }
    if (directives.get(name) !== expected) {
      throw new Error('preview_csp_not_restrictive:' + name);
    }
  }
  for (const [name, expected] of optionalDirectives) {
    if (directives.has(name) && directives.get(name) !== expected) {
      throw new Error('preview_csp_not_restrictive:' + name);
    }
  }
}

function verifyPreviewResponse({ statusCode, headers = {}, body, expectedSha256, expectedGitBlobSha1 }) {
  if (statusCode !== 200) throw new Error('preview_http_status_must_be_200');
  if (!SHA256.test(String(expectedSha256 || '')) || !GIT_BLOB_SHA1.test(String(expectedGitBlobSha1 || ''))) {
    throw new Error('pinned_sha256_and_git_blob_sha1_required');
  }
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  if (!bytes.length || bytes.length > MAX_BODY_BYTES) throw new Error('preview_body_empty_or_too_large');
  const html = bytes.toString('utf8');
  if (!Buffer.from(html, 'utf8').equals(bytes)) throw new Error('preview_body_must_be_valid_utf8');
  const contentType = singleHeader(headers, 'content-type', 'preview_content_type_must_be_html');
  if (!/^text\/html(?:\s*;|$)/i.test(contentType)) {
    throw new Error('preview_content_type_must_be_html');
  }
  // A static preview must render in the browser, not be forced into a download.
  // Absence is the normal HTML default; if the host sets the header, accept only
  // one exact "inline" value and reject attachment or ambiguous duplicates.
  const contentDisposition = singleHeader(headers, 'content-disposition');
  if (contentDisposition && contentDisposition.toLowerCase() !== 'inline') {
    throw new Error('preview_content_disposition_must_be_inline');
  }
  const nosniff = singleHeader(headers, 'x-content-type-options', 'preview_missing_nosniff_header');
  if (nosniff.toLowerCase() !== 'nosniff') {
    throw new Error('preview_missing_nosniff_header');
  }
  if (headerValues(headers, 'set-cookie').length) {
    throw new Error('static_preview_must_not_set_cookies');
  }
  // The preview is static and sensitive: accept exactly one Cache-Control policy.
  // A coalesced "no-store, public" value is ambiguous and must not pass.
  const cacheControl = singleHeader(headers, 'cache-control', 'preview_missing_no_store_header').toLowerCase();
  if (cacheControl !== 'no-store') {
    throw new Error('preview_missing_no_store_header');
  }

  // The endpoint is HTTPS-only. Require a one-year HSTS policy so a later
  // navigation cannot silently downgrade to HTTP after the first secure visit.
  // Do not require includeSubDomains: unrelated subdomains may have separate TLS policy.
  const strictTransportSecurity = singleHeader(
    headers, 'strict-transport-security', 'preview_missing_hsts_header'
  );
  const hstsDirectives = new Map();
  for (const token of strictTransportSecurity.split(';')) {
    const part = token.trim();
    if (!part) continue;
    const match = /^([a-z][a-z0-9-]*)(?:=([0-9]+))?$/i.exec(part);
    if (!match) throw new Error('preview_hsts_invalid');
    const name = match[1].toLowerCase();
    if (hstsDirectives.has(name)) throw new Error('preview_hsts_duplicate:' + name);
    if (name === 'max-age') {
      if (match[2] === undefined) throw new Error('preview_hsts_max_age_invalid');
      const maxAge = Number(match[2]);
      if (!Number.isSafeInteger(maxAge)) throw new Error('preview_hsts_max_age_invalid');
      hstsDirectives.set(name, maxAge);
    } else if (name === 'includesubdomains' || name === 'preload') {
      if (match[2] !== undefined) throw new Error('preview_hsts_invalid');
      hstsDirectives.set(name, true);
    } else {
      throw new Error('preview_hsts_unknown_directive:' + name);
    }
  }
  const hstsMaxAge = hstsDirectives.get('max-age');
  if (!Number.isSafeInteger(hstsMaxAge) || hstsMaxAge < 31536000) {
    throw new Error('preview_hsts_max_age_too_short');
  }

  const frameOptions = singleHeader(headers, 'x-frame-options', 'preview_missing_x_frame_options_deny');
  if (frameOptions.toLowerCase() !== 'deny') {
    throw new Error('preview_missing_x_frame_options_deny');
  }
  const corp = singleHeader(headers, 'cross-origin-resource-policy', 'preview_missing_cross_origin_resource_policy');
  if (corp.toLowerCase() !== 'same-origin') {
    throw new Error('preview_missing_cross_origin_resource_policy');
  }
  const permissions = singleHeader(headers, 'permissions-policy').toLowerCase().replace(/\s+/g, '');
  const permissionDirectives = new Map();
  for (const entry of permissions.split(',').map(value => value.trim()).filter(Boolean)) {
    const match = /^([a-z-]+)=\(([^()]*)\)$/.exec(entry);
    if (!match) throw new Error('preview_permissions_policy_invalid');
    const name = match[1];
    if (permissionDirectives.has(name)) {
      throw new Error('preview_permissions_policy_duplicate:' + name);
    }
    permissionDirectives.set(name, match[2]);
  }
  for (const name of ['camera', 'microphone', 'geolocation']) {
    if (!permissionDirectives.has(name)) {
      throw new Error('preview_permissions_policy_missing:' + name);
    }
    if (permissionDirectives.get(name) !== '') {
      throw new Error('preview_permissions_policy_not_restricted:' + name);
    }
  }

  const robotsMeta = metaNamedContents(html, 'robots');
  if (robotsMeta.length !== 1) throw new Error('preview_meta_robots_count_invalid');
  const robotsHeaderValues = headerValues(headers, 'x-robots-tag');
  if (robotsHeaderValues.length > 1) throw new Error('preview_header_ambiguous:x-robots-tag');
  const robots = [...robotsHeaderValues, robotsMeta[0]]
    .flatMap(value => String(value).toLowerCase().split(/[,\s]+/).filter(Boolean));
  if (robots.some(value => ['index', 'follow', 'all'].includes(value)) ||
      !robots.includes('noindex') || !robots.includes('nofollow')) {
    throw new Error('preview_must_be_noindex_nofollow');
  }

  const referrerMeta = metaNamedContents(html, 'referrer');
  if (referrerMeta.length !== 1) throw new Error('preview_meta_referrer_count_invalid');
  const referrerHeader = singleHeader(headers, 'referrer-policy').toLowerCase();
  if (referrerHeader && referrerHeader !== 'no-referrer') {
    throw new Error('preview_must_disable_referrer');
  }
  if (referrerMeta[0].trim().toLowerCase() !== 'no-referrer') {
    throw new Error('preview_must_disable_referrer');
  }

  const script = inlineBlockContent(html, 'script');
  const style = inlineBlockContent(html, 'style');
  const scriptSource = "'sha256-" + cspSha256(script) + "'";
  const styleSource = "'sha256-" + cspSha256(style) + "'";
  const requiredCspDirectives = [
    ['default-src', "'none'"],
    ['script-src', scriptSource],
    ['style-src', styleSource],
    ['connect-src', "'none'"],
    ['img-src', "'none'"],
    ['font-src', "'none'"],
    ['object-src', "'none'"],
    ['frame-src', "'none'"],
    ['media-src', "'none'"],
    ['manifest-src', "'none'"],
    ['worker-src', "'none'"],
    ['child-src', "'none'"],
    ['form-action', "'none'"],
    ['base-uri', "'none'"]
  ];
  const optionalCspDirectives = [
    ['script-src-elem', scriptSource],
    ['style-src-elem', styleSource],
    ['script-src-attr', "'none'"],
    ['style-src-attr', "'none'"]
  ];

  const responseCspValues = headerValues(headers, 'content-security-policy');
  if (responseCspValues.length === 0) throw new Error('preview_missing_http_csp_header');
  if (responseCspValues.length !== 1 || responseCspValues[0].includes(',')) {
    throw new Error('preview_csp_header_ambiguous');
  }
  verifyCspPolicy(responseCspValues[0], [
    ...requiredCspDirectives,
    ['frame-ancestors', "'none'"]
  ], optionalCspDirectives, 'http');

  const metaPolicies = metaCspPolicies(html);
  if (metaPolicies.length !== 1) throw new Error('preview_meta_csp_count_invalid');
  verifyCspPolicy(metaPolicies[0], requiredCspDirectives, optionalCspDirectives, 'meta');

  const actualSha256 = sha256(bytes);
  const actualGitBlobSha1 = gitBlobSha1(bytes);
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error('preview_sha256_does_not_match_reviewed_source');
  }
  if (actualGitBlobSha1.toLowerCase() !== expectedGitBlobSha1.toLowerCase()) {
    throw new Error('preview_git_blob_sha1_does_not_match_reviewed_source');
  }
  return Object.freeze({
    verified: true,
    deploymentPerformed: false,
    method: 'GET',
    statusCode,
    bytes: bytes.length,
    sha256: actualSha256,
    gitBlobSha1: actualGitBlobSha1,
    noindex: true,
    nofollow: true,
    noReferrer: true,
    connectSrcNone: true,
    restrictedPermissionsPolicy: true,
    cookiesSet: false,
    renderableInline: true,
    hstsProtected: true
  });
}

function fetchPreview(urlValue, expectedSha256, expectedGitBlobSha1, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  request = https.request
} = {}) {
  const url = verifyTargetUrl(urlValue);
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET',
      agent: false,
      headers: {
        accept: 'text/html',
        'accept-encoding': 'identity',
        'cache-control': 'no-cache',
        'user-agent': 'Dadyar-Preview-ReadOnly-Verification/1.0'
      }
    }, response => {
      const chunks = [];
      let total = 0;
      response.on('data', chunk => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.length;
        if (total > MAX_BODY_BYTES) {
          response.destroy(new Error('preview_body_exceeds_1MiB'));
          return;
        }
        chunks.push(bytes);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          resolve(verifyPreviewResponse({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
            expectedSha256,
            expectedGitBlobSha1
          }));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('preview_request_timeout')));
    req.on('error', reject);
    req.end();
  });
}

if (require.main === module) {
  const [url, expectedSha256, expectedGitBlobSha1] = process.argv.slice(2);
  if (!url || !expectedSha256 || !expectedGitBlobSha1) {
    process.stderr.write('Usage: node scripts/verify-public-preview-http.cjs https://mehdisehat.ir/dadyar-preview/ EXPECTED_SHA256 EXPECTED_GIT_BLOB_SHA1\n');
    process.exitCode = 2;
  } else {
    fetchPreview(url, expectedSha256, expectedGitBlobSha1)
      .then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
      .catch(error => {
        process.stderr.write('NOT_VERIFIED: ' + String(error && error.message || 'preview_probe_failed') + '\n');
        process.exitCode = 1;
      });
  }
}

module.exports = { fetchPreview, verifyPreviewResponse, verifyTargetUrl, sha256, gitBlobSha1, cspSha256 };
