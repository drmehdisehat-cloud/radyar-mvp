'use strict';

// Offline-verifiable OIDC-compatible JWT access-token adapter.
// It uses owner-pinned RSA public keys only: no discovery, JWKS fetch, cookies,
// proxy identity headers, environment reads, or network access occur here.
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { parseJsonRejectDuplicateKeys } = require('../scripts/strict-json.cjs');

const MAX_TOKEN_BYTES = 8192;
const MAX_KEYS = 8;
const LABEL_FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
const KID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const JTI_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;

function authenticationFailure() {
  const error = new Error('reviewer_access_token_invalid');
  error.code = 'AUTHENTICATED_REVIEWER_REQUIRED';
  return error;
}

function isSafeLabel(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    value.trim() === value && !LABEL_FORBIDDEN.test(value);
}

function validateIssuer(value) {
  if (typeof value !== 'string' || !value) {
    throw new TypeError('A canonical HTTPS OIDC issuer is required.');
  }
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new TypeError('OIDC issuer must be a valid HTTPS URL.'); }
  const normalized = parsed.href;
  const normalizedWithoutRootSlash = parsed.pathname === '/' && normalized.endsWith('/')
    ? normalized.slice(0, -1)
    : normalized;
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.search || parsed.hash ||
      (value !== normalized && value !== normalizedWithoutRootSlash)) {
    throw new TypeError('OIDC issuer must be a canonical HTTPS URL without credentials, query or fragment.');
  }
  return value;
}

function decodeBase64url(segment, maxBytes) {
  if (typeof segment !== 'string' || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw authenticationFailure();
  }
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.length < 1 || bytes.length > maxBytes || bytes.toString('base64url') !== segment) {
    throw authenticationFailure();
  }
  return bytes;
}

function parseJsonSegment(segment, maxBytes) {
  const bytes = decodeBase64url(segment, maxBytes);
  let decoded;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw authenticationFailure(); }
  let value;
  try { value = parseJsonRejectDuplicateKeys(decoded); }
  catch { throw authenticationFailure(); }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw authenticationFailure();
  }
  return value;
}

function createOidcReviewerAuthenticator(options = {}) {
  const {
    issuer,
    audience,
    reviewIssuer,
    keys,
    isSessionActive,
    sessionStatusTimeoutMs = 1000,
    now = Date.now,
    maxTokenAgeSeconds = 600,
    clockSkewSeconds = 30
  } = options;

  const pinnedIssuer = validateIssuer(issuer);
  if (!isSafeLabel(reviewIssuer)) throw new TypeError('The review trust-store issuer is required.');
  if (!isSafeLabel(audience)) throw new TypeError('A non-empty exact OIDC audience is required.');
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > MAX_KEYS) {
    throw new TypeError('Between one and eight owner-pinned OIDC RSA public keys are required.');
  }
  if (typeof now !== 'function') throw new TypeError('The OIDC clock must be a function.');
  if (typeof isSessionActive !== 'function') {
    throw new TypeError('A trusted server-side session status callback is required.');
  }
  if (!Number.isSafeInteger(sessionStatusTimeoutMs) || sessionStatusTimeoutMs < 10 || sessionStatusTimeoutMs > 5000) {
    throw new TypeError('sessionStatusTimeoutMs must be an integer from 10 through 5000.');
  }
  if (!Number.isSafeInteger(maxTokenAgeSeconds) || maxTokenAgeSeconds < 60 || maxTokenAgeSeconds > 900) {
    throw new TypeError('maxTokenAgeSeconds must be an integer between 60 and 900.');
  }
  if (!Number.isSafeInteger(clockSkewSeconds) || clockSkewSeconds < 0 || clockSkewSeconds > 60) {
    throw new TypeError('clockSkewSeconds must be an integer between 0 and 60.');
  }

  const pinnedKeys = new Map();
  for (const record of keys) {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        !KID_PATTERN.test(record.kid || '') ||
        typeof record.publicKeyPem !== 'string' ||
        record.publicKeyPem.length < 1 || record.publicKeyPem.length > 16384 ||
        /-----BEGIN [^-]*PRIVATE KEY-----/.test(record.publicKeyPem) ||
        pinnedKeys.has(record.kid)) {
      throw new TypeError('Each OIDC key must have a unique kid and a public PEM only.');
    }
    let key;
    try { key = crypto.createPublicKey(record.publicKeyPem); }
    catch { throw new TypeError('An owner-pinned OIDC public key is invalid.'); }
    const details = key.asymmetricKeyDetails || {};
    if (key.asymmetricKeyType !== 'rsa' ||
        !Number.isSafeInteger(details.modulusLength) ||
        details.modulusLength < 2048 || details.modulusLength > 8192) {
      throw new TypeError('OIDC keys must be RSA with a modulus between 2048 and 8192 bits.');
    }
    pinnedKeys.set(record.kid, Object.freeze({
      key,
      signatureBytes: Math.ceil(details.modulusLength / 8)
    }));
  }

  return async function authenticateReviewer(request) {
    try {
      if (!request || !request.headers || !Array.isArray(request.rawHeaders) ||
          request.rawHeaders.length % 2 !== 0) throw authenticationFailure();

      let authorizationCount = 0;
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        if (typeof request.rawHeaders[index] !== 'string') throw authenticationFailure();
        if (request.rawHeaders[index].toLowerCase() === 'authorization') authorizationCount++;
      }
      if (authorizationCount !== 1) throw authenticationFailure();

      const authorization = request.headers.authorization;
      if (typeof authorization !== 'string' || authorization.length > MAX_TOKEN_BYTES + 16) {
        throw authenticationFailure();
      }
      const match = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(authorization);
      if (!match || match[1].length > MAX_TOKEN_BYTES || !TOKEN_PATTERN.test(match[1])) {
        throw authenticationFailure();
      }

      const parts = match[1].split('.');
      if (parts.length !== 3) throw authenticationFailure();
      const header = parseJsonSegment(parts[0], 2048);
      const claims = parseJsonSegment(parts[1], 6144);
      const signature = decodeBase64url(parts[2], 1024);

      const headerKeys = Object.keys(header).sort().join(',');
      if (headerKeys !== 'alg,kid,typ' || header.alg !== 'RS256' ||
          header.typ !== 'JWT' || !KID_PATTERN.test(header.kid || '')) {
        throw authenticationFailure();
      }
      const pinned = pinnedKeys.get(header.kid);
      if (!pinned || signature.length !== pinned.signatureBytes) throw authenticationFailure();

      const signingInput = Buffer.from(parts[0] + '.' + parts[1], 'ascii');
      let signatureValid = false;
      try { signatureValid = crypto.verify('RSA-SHA256', signingInput, pinned.key, signature); }
      catch { throw authenticationFailure(); }
      if (!signatureValid) throw authenticationFailure();

      const tokenAudience = claims.aud;
      const audienceMatches = tokenAudience === audience ||
        (Array.isArray(tokenAudience) && tokenAudience.length === 1 && tokenAudience[0] === audience);
      const rolesValid = Array.isArray(claims.roles) && claims.roles.length === 1 &&
        claims.roles[0] === 'preview-reviewer';
      if (claims.iss !== pinnedIssuer || !audienceMatches || !isSafeLabel(claims.sub) ||
          !JTI_PATTERN.test(claims.jti || '') || claims.reviewer_independent !== true ||
          !rolesValid) {
        throw authenticationFailure();
      }

      const currentMs = now();
      if (!Number.isFinite(currentMs) || currentMs <= 0) throw authenticationFailure();
      const currentSeconds = Math.floor(currentMs / 1000);
      const skew = clockSkewSeconds;
      if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
          claims.exp <= currentSeconds || claims.iat > currentSeconds + skew ||
          currentSeconds - claims.iat > maxTokenAgeSeconds + skew ||
          claims.exp <= claims.iat || claims.exp - claims.iat > maxTokenAgeSeconds) {
        throw authenticationFailure();
      }
      if (claims.nbf !== undefined &&
          (!Number.isSafeInteger(claims.nbf) || claims.nbf > currentSeconds + skew ||
           claims.nbf >= claims.exp)) {
        throw authenticationFailure();
      }

      // Short expiry is not immediate revocation. Check the trusted owner-side
      // session registry on every request and fail closed on false, timeout or outage.
      const controller = new AbortController();
      let timeout;
      let sessionActive;
      try {
        const statusPromise = Promise.resolve().then(() => isSessionActive(Object.freeze({
          issuer: pinnedIssuer,
          subject: claims.sub,
          tokenId: claims.jti,
          issuedAt: claims.iat,
          expiresAt: claims.exp,
          signal: controller.signal
        })));
        const timeoutPromise = new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(authenticationFailure());
          }, sessionStatusTimeoutMs);
        });
        sessionActive = await Promise.race([statusPromise, timeoutPromise]);
      } catch {
        throw authenticationFailure();
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      if (sessionActive !== true) throw authenticationFailure();

      return Object.freeze({
        authenticated: true,
        issuer: reviewIssuer,
        identityIssuer: pinnedIssuer,
        subject: claims.sub,
        independent: true,
        roles: Object.freeze([...claims.roles])
      });
    } catch {
      throw authenticationFailure();
    }
  };
}

module.exports = { createOidcReviewerAuthenticator };
