'use strict';

// Verifies a short-lived, owner-pinned RS256 reviewer session assertion.
// It does not perform login, discover keys over the network, or trust identity headers.
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { parseJsonRejectDuplicateKeys } = require('../scripts/strict-json.cjs');

const DEFAULT_COOKIE = '__Host-dadyar-review-session';
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const KID = /^[A-Za-z0-9._-]{1,128}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ROLE = /^[a-z][a-z0-9-]{0,63}$/;
const JTI = /^[A-Za-z0-9_-]{22,128}$/;
const IDENTITY_CONTROL = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;

function unauthenticated() {
  const error = new Error('Authenticated reviewer session required.');
  error.code = 'AUTHENTICATED_REVIEWER_REQUIRED';
  return error;
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function decodeSegment(segment) {
  if (typeof segment !== 'string' || !BASE64URL.test(segment)) return null;
  const bytes = Buffer.from(segment, 'base64url');
  if (!bytes.length || bytes.toString('base64url') !== segment) return null;
  return bytes;
}

function safeIdentity(value) {
  return typeof value === 'string' && SAFE_LABEL.test(value) &&
    value.trim() === value && !IDENTITY_CONTROL.test(value);
}

function canonicalHttpsIssuer(value) {
  if (typeof value !== 'string' || !value) throw new TypeError('A canonical HTTPS issuer is required.');
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new TypeError('Issuer must be a valid HTTPS URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.href !== value) {
    throw new TypeError('Issuer must be a canonical HTTPS URL without credentials, query or fragment.');
  }
  return value;
}

function readCookie(request, cookieName) {
  const header = request && request.headers && request.headers.cookie;
  if (typeof header !== 'string' || !header || header.length > 16384) throw unauthenticated();

  const cookies = new Map();
  for (const part of header.split(';')) {
    const item = part.trim();
    const separator = item.indexOf('=');
    if (separator <= 0) throw unauthenticated();
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/.test(name) ||
        !value || /[\u0000-\u0020\u007f;]/.test(value) || cookies.has(name)) {
      throw unauthenticated();
    }
    cookies.set(name, value);
  }

  const token = cookies.get(cookieName);
  if (typeof token !== 'string' || token.length > 8192 || token.includes('=')) throw unauthenticated();
  return token;
}

function createPinnedReviewerJwtAuthenticator(options = {}) {
  const {
    issuer,
    audience,
    keys,
    isSessionActive,
    sessionStatusTimeoutMs = 1000,
    cookieName = DEFAULT_COOKIE,
    now = Date.now,
    clockSkewSeconds = 60,
    maxTokenAgeSeconds = 300,
    maxTokenLifetimeSeconds = 900
  } = options;

  const pinnedIssuer = canonicalHttpsIssuer(issuer);
  if (!safeIdentity(audience)) throw new TypeError('A safe, exact reviewer audience is required.');
  if (cookieName !== DEFAULT_COOKIE) throw new TypeError('The fixed __Host- reviewer cookie name is required.');
  if (typeof now !== 'function') throw new TypeError('A clock function is required.');
  if (typeof isSessionActive !== 'function') throw new TypeError('A trusted server-side session status callback is required.');
  if (!Number.isSafeInteger(sessionStatusTimeoutMs) || sessionStatusTimeoutMs < 10 || sessionStatusTimeoutMs > 5000) {
    throw new TypeError('sessionStatusTimeoutMs must be an integer from 10 through 5000.');
  }
  if (!Number.isSafeInteger(clockSkewSeconds) || clockSkewSeconds < 0 || clockSkewSeconds > 120) {
    throw new TypeError('clockSkewSeconds must be an integer from 0 through 120.');
  }
  if (!Number.isSafeInteger(maxTokenAgeSeconds) || maxTokenAgeSeconds < 30 || maxTokenAgeSeconds > 3600) {
    throw new TypeError('maxTokenAgeSeconds must be an integer from 30 through 3600.');
  }
  if (!Number.isSafeInteger(maxTokenLifetimeSeconds) || maxTokenLifetimeSeconds < 60 ||
      maxTokenLifetimeSeconds > 3600 || maxTokenLifetimeSeconds < maxTokenAgeSeconds) {
    throw new TypeError('maxTokenLifetimeSeconds must be at least maxTokenAgeSeconds and at most 3600.');
  }
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 16) {
    throw new TypeError('Between one and sixteen pinned reviewer public keys are required.');
  }

  const keyMap = new Map();
  for (const entry of keys) {
    if (!plainObject(entry) || Object.keys(entry).sort().join(',') !== 'kid,publicKeyPem' ||
        typeof entry.kid !== 'string' || !KID.test(entry.kid) ||
        typeof entry.publicKeyPem !== 'string' || keyMap.has(entry.kid)) {
      throw new TypeError('Invalid or duplicate pinned reviewer key entry.');
    }
    let publicKey;
    try { publicKey = crypto.createPublicKey(entry.publicKeyPem); }
    catch { throw new TypeError('Invalid pinned reviewer public key.'); }
    const details = publicKey.asymmetricKeyDetails || {};
    if (publicKey.asymmetricKeyType !== 'rsa' || !Number.isSafeInteger(details.modulusLength) ||
        details.modulusLength < 2048 ||
        publicKey.export({ type: 'spki', format: 'pem' }) !== entry.publicKeyPem) {
      throw new TypeError('Pinned reviewer keys must be canonical RSA SPKI public keys of at least 2048 bits.');
    }
    keyMap.set(entry.kid, publicKey);
  }

  const authenticateReviewer = async function authenticateReviewer(request) {
    try {
      const token = readCookie(request, cookieName);
      const segments = token.split('.');
      if (segments.length !== 3) throw unauthenticated();
      const headerBytes = decodeSegment(segments[0]);
      const payloadBytes = decodeSegment(segments[1]);
      const signature = decodeSegment(segments[2]);
      if (!headerBytes || !payloadBytes || !signature || signature.length < 256 || signature.length > 512) {
        throw unauthenticated();
      }

      const decoder = new TextDecoder('utf-8', { fatal: true });
      const header = parseJsonRejectDuplicateKeys(decoder.decode(headerBytes));
      const claims = parseJsonRejectDuplicateKeys(decoder.decode(payloadBytes));
      if (!plainObject(header) || Object.keys(header).sort().join(',') !== 'alg,kid,typ' ||
          header.alg !== 'RS256' || header.typ !== 'JWT' ||
          typeof header.kid !== 'string' || !KID.test(header.kid)) {
        throw unauthenticated();
      }
      const publicKey = keyMap.get(header.kid);
      if (!publicKey) throw unauthenticated();

      const signingInput = segments[0] + '.' + segments[1];
      if (!crypto.verify('RSA-SHA256', Buffer.from(signingInput, 'ascii'), publicKey, signature)) {
        throw unauthenticated();
      }
      if (!plainObject(claims) || claims.iss !== pinnedIssuer ||
          !safeIdentity(claims.sub) || !JTI.test(claims.jti) || claims.reviewer_independent !== true ||
          !Array.isArray(claims.roles) || claims.roles.length < 1 || claims.roles.length > 32 ||
          claims.roles.some(role => typeof role !== 'string' || !ROLE.test(role)) ||
          new Set(claims.roles).size !== claims.roles.length ||
          !claims.roles.includes('preview-reviewer')) {
        throw unauthenticated();
      }

      const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
      if (!Array.isArray(audiences) || audiences.length < 1 || audiences.length > 16 ||
          audiences.some(value => typeof value !== 'string') ||
          !audiences.includes(audience) ||
          (audiences.length > 1 && claims.azp !== audience) ||
          (claims.azp !== undefined && claims.azp !== audience)) {
        throw unauthenticated();
      }

      const current = now();
      if (!Number.isFinite(current)) throw unauthenticated();
      const currentSeconds = Math.floor(current / 1000);
      const { iat, exp, nbf } = claims;
      if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp) ||
          (nbf !== undefined && !Number.isSafeInteger(nbf)) ||
          iat > currentSeconds + clockSkewSeconds ||
          currentSeconds - iat > maxTokenAgeSeconds + clockSkewSeconds ||
          exp <= currentSeconds - clockSkewSeconds ||
          exp <= iat || exp - iat > maxTokenLifetimeSeconds ||
          (nbf !== undefined && nbf > currentSeconds + clockSkewSeconds)) {
        throw unauthenticated();
      }

      // A valid signature and short expiry do not provide immediate revocation.
      // Consult a trusted server-side session/revocation store for every request.
      // False, malformed or unavailable status must fail closed.
      let sessionActive;
      const controller = new AbortController();
      let timeout;
      try {
        const statusPromise = Promise.resolve().then(() => isSessionActive(Object.freeze({
          issuer: pinnedIssuer,
          subject: claims.sub,
          tokenId: claims.jti,
          issuedAt: iat,
          expiresAt: exp,
          signal: controller.signal
        })));
        const timeoutPromise = new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(unauthenticated());
          }, sessionStatusTimeoutMs);
        });
        sessionActive = await Promise.race([statusPromise, timeoutPromise]);
      } catch {
        throw unauthenticated();
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      if (sessionActive !== true) throw unauthenticated();

      return Object.freeze({
        authenticated: true,
        independent: true,
        issuer: pinnedIssuer,
        subject: claims.sub,
        roles: Object.freeze([...claims.roles])
      });
    } catch {
      throw unauthenticated();
    }
  };

  Object.defineProperty(authenticateReviewer, 'adapterId', {
    value: 'dadyar-pinned-rs256-reviewer-session-v1',
    enumerable: true,
    writable: false,
    configurable: false
  });
  return Object.freeze(authenticateReviewer);
}

module.exports = { createPinnedReviewerJwtAuthenticator, DEFAULT_COOKIE };
