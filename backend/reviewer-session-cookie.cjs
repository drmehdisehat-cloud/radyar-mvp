'use strict';

// Cookie serialization only. This does not authenticate a reviewer or validate a JWT.
// The caller must verify the token before issuing it and must use HTTPS.
const COOKIE_NAME = '__Host-dadyar-review-session';
const MAX_TOKEN_LENGTH = 8192;
const MAX_COOKIE_AGE_SECONDS = 300;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function isCanonicalCompactJwt(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TOKEN_LENGTH) {
    return false;
  }
  const segments = value.split('.');
  if (segments.length !== 3) return false;
  return segments.every(segment => {
    if (!BASE64URL.test(segment)) return false;
    const bytes = Buffer.from(segment, 'base64url');
    return bytes.length > 0 && bytes.toString('base64url') === segment;
  });
}

function createReviewerSessionCookie(token, options = {}) {
  if (!isCanonicalCompactJwt(token)) {
    throw new TypeError('A canonical compact reviewer token is required.');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => key !== 'maxAgeSeconds')) {
    throw new TypeError('Only maxAgeSeconds may be configured.');
  }
  const maxAgeSeconds = options.maxAgeSeconds === undefined ? MAX_COOKIE_AGE_SECONDS : options.maxAgeSeconds;
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 ||
      maxAgeSeconds > MAX_COOKIE_AGE_SECONDS) {
    throw new TypeError('Reviewer cookie maxAgeSeconds must be an integer from 1 through 300.');
  }

  // __Host- cookies require Secure, Path=/ and no Domain attribute.
  return COOKIE_NAME + '=' + token +
    '; Path=/; Max-Age=' + maxAgeSeconds + '; Secure; HttpOnly; SameSite=Strict';
}

function clearReviewerSessionCookie() {
  return COOKIE_NAME +
    '=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Strict';
}

module.exports = {
  COOKIE_NAME,
  MAX_COOKIE_AGE_SECONDS,
  isCanonicalCompactJwt,
  createReviewerSessionCookie,
  clearReviewerSessionCookie
};
