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

function header(headers, name) {
  const value = headers && headers[String(name).toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : String(value || '');
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
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp('<meta\\s+name="' + escaped + '"\\s+content="([^"]*)"', 'i'));
  return match ? match[1] : '';
}

function metaCsp(html) {
  const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
  return match ? match[1] : '';
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
  for (const directive of ['camera=()', 'microphone=()', 'geolocation=()']) {
    if (!permissions.split(',').includes(directive)) {
      throw new Error('preview_permissions_policy_missing:' + directive);
    }
  }

  const robots = (header(headers, 'x-robots-tag') + ' ' + metaContent(html, 'robots')).toLowerCase();
  if (!/\bnoindex\b/.test(robots) || !/\bnofollow\b/.test(robots)) {
    throw new Error('preview_must_be_noindex_nofollow');
  }
  const referrer = (header(headers, 'referrer-policy') + ' ' + metaContent(html, 'referrer')).toLowerCase();
  if (!/\bno-referrer\b/.test(referrer)) throw new Error('preview_must_disable_referrer');
  const responseCsp = header(headers, 'content-security-policy');
  if (!responseCsp) throw new Error('preview_missing_http_csp_header');
  const hasDirective = (policy, name, expected) => policy.split(';').some(part => {
    const tokens = part.trim().split(/\\s+/);
    const directiveName = tokens.shift();
    return directiveName && directiveName.toLowerCase() === name &&
      tokens.join(' ').toLowerCase() === expected;
  });
  if (!hasDirective(responseCsp, 'frame-ancestors', "'none'")) {
    throw new Error("preview_http_csp_missing:frame-ancestors 'none'");
  }
  const csp = [responseCsp, metaCsp(html)].filter(Boolean).join('; ');
  for (const [name, expected] of [
    ['default-src', "'none'"],
    ['connect-src', "'none'"],
    ['form-action', "'none'"]
  ]) {
    if (!hasDirective(csp, name, expected)) {
      throw new Error('preview_csp_missing:' + name + ' ' + expected);
    }
  }

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
