'use strict';
// Experimental, disconnected HTTP gate. NOT a staging entrypoint or a deployable
// authentication system. Never use with real client data or internet traffic.
const net = require('node:net');
const { verifyPreviewBearer } = require('./preview-auth');

const DENIAL_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Length': '0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'WWW-Authenticate': 'Bearer realm="dadyar-preview"',
});

// A loopback listener alone is not an origin boundary: DNS rebinding or a
// local reverse proxy could route a non-local Host to this test harness.
// Fail closed before the downstream handler, even with a valid bearer token.
// This is defense in depth, NOT deployable authentication.
function isLocalPreviewRequest(req) {
  const peer = req?.socket?.remoteAddress;
  const headers = req?.headers;
  if (typeof peer !== 'string' || net.isIP(peer) === 0 ||
      !headers || !Array.isArray(req.rawHeaders) ||
      req.rawHeaders.length % 2 !== 0) return false;
  // Only the exact listener loopback identities are trusted. Other 127/8
  // addresses are local but must not silently expand the preview boundary.
  if (peer !== '::1' && peer !== '127.0.0.1' &&
      peer.toLowerCase() !== '::ffff:127.0.0.1') return false;

  const forbidden = new Set(['forwarded', 'via', 'x-real-ip',
    'proxy-connection', 'x-original-host', 'x-original-url', 'x-rewrite-url',
    'cf-connecting-ip', 'true-client-ip', 'fastly-client-ip',
    'x-client-ip', 'x-cluster-client-ip', 'x-envoy-external-address']);
  if (Object.keys(headers).some(name => forbidden.has(name.toLowerCase()) ||
      name.toLowerCase().startsWith('x-forwarded-'))) return false;

  let hostCount = 0;
  let rawHost;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (typeof req.rawHeaders[i] !== 'string' ||
        typeof req.rawHeaders[i + 1] !== 'string') return false;
    if (req.rawHeaders[i].toLowerCase() === 'host') {
      hostCount++;
      rawHost = req.rawHeaders[i + 1];
    }
  }
  if (hostCount !== 1 || typeof headers.host !== 'string' ||
      rawHost !== headers.host) return false;
  // Require an explicit port matching the actual listener; do not trust
  // arbitrary DNS names that happen to resolve to the loopback interface.
  const match = /^(?:localhost|127\.0\.0\.1|\[::1\]):(\d{1,5})$/i.exec(headers.host);
  if (!match || !Number.isInteger(req.socket.localPort) ||
      req.socket.localPort < 1 || req.socket.localPort > 65535 ||
      String(req.socket.localPort) !== match[1]) return false;
  if (headers.origin !== undefined && headers.origin !== 'http://' + headers.host) return false;
  if (headers['sec-fetch-site'] !== undefined &&
      headers['sec-fetch-site'] !== 'same-origin') return false;
  return true;
}

// The caller must supply the expected credential out of band. Deny before
// invoking any downstream handler, including on GET routes or POST requests.
function createPreviewGate(configuredToken, next) {
  if (typeof next !== 'function') throw new TypeError('next must be a function');
  return function previewGate(req, res) {
    if (!isLocalPreviewRequest(req) || !verifyPreviewBearer(req, configuredToken)) {
      res.writeHead(401, DENIAL_HEADERS);
      res.end();
      return;
    }
    return next(req, res);
  };
}
module.exports = { createPreviewGate, isLocalPreviewRequest };
