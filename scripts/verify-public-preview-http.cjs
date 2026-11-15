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
  const key = Object.keys(headers || {}).find(candidate => candidate.toLowerCase() === wanted);
  if (!key) return [];
  const value = headers[key];
  if (value == null) return [];
  return Array.isArray(value) ? value.map(item => String(item)) : [String(value)];
}

function header(headers, name) {
  return headerValues(headers, name).join(', ');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
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

function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp('<meta\\s+name="' + escaped + '"\\s+content="([^"]*)"', 'i'));
  return match ? match[1] : '';
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

function verifyCspPolicy(policy, requiredDirectives, source) {
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
    directives.set(name, tokens.join(' ').toLowerCase());
  }
  for (const [name, expected] of requiredDirectives) {
    if (!directives.has(name)) {
      throw new Error('preview_' + source + '_csp_missing:' + name);
    }
    if (directives.get(name) !== expected) {
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
  if (!/^text\/html(?:\s*;|$)/i.test(header(headers, 'content-type'))) {
    throw new Error('preview_content_type_must_be_html');
  }
  if (header(headers, 'x-content-type-options').trim().toLowerCase() !== 'nosniff') {
    throw new Error('preview_missing_nosniff_header');
  }
  if (header(headers, 'set-cookie')) throw new Error('static_preview_must_not_set_cookies');
  if (!header(headers, 'cache-control').toLowerCase().split(',').some(value => value.trim() === 'no-store')) {
    throw new Error('preview_missing_no_store_header');
  }
  if (header(headers, 'x-frame-options').trim().toLowerCase() !== 'deny') {
    throw new Error('preview_missing_x_frame_options_deny');
  }
  if (header(headers, 'cross-origin-resource-policy').trim().toLowerCase() !== 'same-origin') {
    throw new Error('preview_missing_cross_origin_resource_policy');
  }
  const permissions = header(headers, 'permissions-policy').toLowerCase().replace(/\s+/g, '');
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

  const robots = (header(headers, 'x-robots-tag') + ' ' + metaContent(html, 'robots')).toLowerCase();
  if (!/\bnoindex\b/.test(robots) || !/\bnofollow\b/.test(robots)) {
    throw new Error('preview_must_be_noindex_nofollow');
  }
  const referrer = (header(headers, 'referrer-policy') + ' ' + metaContent(html, 'referrer')).toLowerCase();
  if (!/\bno-referrer\b/.test(referrer)) throw new Error('preview_must_disable_referrer');

  const responseCspValues = headerValues(headers, 'content-security-policy');
  if (responseCspValues.length !== 1 || responseCspValues[0].includes(',')) {
    throw new Error('preview_csp_header_ambiguous');
  }
  verifyCspPolicy(responseCspValues[0], [
    ['default-src', "'none'"],
    ['connect-src', "'none'"],
    ['form-action', "'none'"],
    ['frame-ancestors', "'none'"]
  ], 'http');

  const metaPolicies = metaCspPolicies(html);
  if (metaPolicies.length !== 1) throw new Error('preview_meta_csp_count_invalid');
  verifyCspPolicy(metaPolicies[0], [
    ['default-src', "'none'"],
    ['connect-src', "'none'"],
    ['form-action', "'none'"]
  ], 'meta');

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
    cookiesSet: false
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

module.exports = { fetchPreview, verifyPreviewResponse, verifyTargetUrl, sha256, gitBlobSha1 };
