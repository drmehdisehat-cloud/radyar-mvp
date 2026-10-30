'use strict';
// Isolated prototype for a future authenticated preview. NOT connected to the
// development API and NOT permission to deploy. TLS, sessions, CSRF and human
// security review are required before any network-facing integration.
const { createHash, timingSafeEqual } = require('node:crypto');

// A canonical unpadded base64url encoding of 32 cryptographically random bytes.
// Generate a secret out of band; never commit it, log it or put it in a URL.
function isValidPreviewToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === value;
}

// Use rawHeaders to reject duplicate Authorization fields instead of trusting
// Node's normalized headers, which may discard or combine duplicates.
function verifyPreviewBearer(request, configuredToken) {
  if (!isValidPreviewToken(configuredToken) || !Array.isArray(request?.rawHeaders) ||
      request.rawHeaders.length % 2 !== 0) return false;
  // This prototype accepts only header-based credentials on an origin-form
  // request target. Query strings, fragments and absolute-form targets can
  // expose credentials to logs, browser history or intermediary systems.
  // A missing or non-string target is ambiguous even in test harnesses and
  // middleware adapters. Deny instead of silently skipping URL validation.
  if (typeof request.url !== 'string' ||
      !request.url.startsWith('/') || request.url.startsWith('//') ||
      request.url.includes('?') || request.url.includes('#')) return false;
  let bearer;
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const name = request.rawHeaders[i];
    if (typeof name !== 'string') return false;
    const lowerName = name.toLowerCase();
    // Do not mix bearer authentication with ambient cookie or proxy
    // credentials, regardless of whether they contain the preview token.
    if (lowerName === 'proxy-authorization' || lowerName === 'cookie') return false;
    if (lowerName !== 'authorization') continue;
    if (bearer !== undefined || typeof request.rawHeaders[i + 1] !== 'string') return false;
    bearer = request.rawHeaders[i + 1];
  }
  if (typeof bearer !== 'string') return false;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(bearer);
  if (!match || !isValidPreviewToken(match[1])) return false;
  // Equal-sized digests avoid secret-dependent byte comparisons.
  const digest = value => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(match[1]), digest(configuredToken));
}

module.exports = { isValidPreviewToken, verifyPreviewBearer };
