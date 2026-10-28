'use strict';
// Development-only, stateless API prototype. Do not expose publicly.
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { validateCase } = require('./validation');
const { createRateLimiter } = require('./rate-limit');
// UTF-8 Persian text may take three bytes per character. The interview allows
// 5,000 characters of story plus five answers of up to 2,000 characters each;
// 16 KiB would reject otherwise-valid Persian interviews. Keep a strict byte cap.
const MAX_BODY = 64 * 1024;
// JSON over HTTP must be UTF-8; reject misleading or unknown charset labels.
const JSON_MEDIA_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i;
// Fail closed on malformed UTF-8 rather than silently changing evidence text.
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
const WEB_ROOT = path.resolve(__dirname, '..');
// Explicit allowlist: no directory traversal, dotfiles, or arbitrary file reads.
const STATIC_FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/flows.js': ['flows.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/export.js': ['export.js', 'text/javascript; charset=utf-8'],
  '/api-validation.js': ['api-validation.js', 'text/javascript; charset=utf-8'],
});
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
function sendStatic(res, route) {
  const [file, contentType] = STATIC_FILES[route];
  fs.readFile(path.join(WEB_ROOT, file), (error, bytes) => {
    if (error) return send(res, 500, { error: 'asset_unavailable' });
    res.writeHead(200, { ...HEADERS, 'Content-Type': contentType, 'Content-Security-Policy': PAGE_CSP });
    res.end(bytes);
  });
}
function send(res, status, data) {
  res.writeHead(status, HEADERS);
  res.end(JSON.stringify(data));
}
// A loopback-bound server can still be targeted through DNS rebinding.
// Defense in depth: even if someone mistakenly changes the listen address,
// only peers from the loopback interface may access the development service.
function isLoopbackPeer(address) {
  return typeof address === 'string' && net.isIP(address) !== 0 &&
    (address === '::1' || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(address) ||
     /^::ffff:127\.(?:\d{1,3}\.){2}\d{1,3}$/i.test(address));
}
// Require an explicit local Host and reject cross-origin browser requests.
function isLocalRequest(req) {
  if (!isLoopbackPeer(req.socket.remoteAddress)) return false;
  // Node normally exposes only the first Host header in req.headers.host.
  // Reject duplicate raw Host fields to prevent ambiguous local-origin checks.
  // Unit-test request stubs may omit rawHeaders; live HTTP requests include it.
  if (Array.isArray(req.rawHeaders)) {
    let hostFields = 0;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (typeof req.rawHeaders[i] === 'string' &&
          req.rawHeaders[i].toLowerCase() === 'host') hostFields++;
    }
    if (hostFields !== 1) return false;
  }
  const host = req.headers.host || '';
  const match = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/i.exec(host);
  if (!match) return false;
  // A Host with a forged port must not be treated as this local service.
  // The port is omitted only for ordinary HTTP on port 80.
  const requestedPort = match[1] === undefined ? 80 : Number(match[1]);
  if (requestedPort !== req.socket.localPort) return false;
  const origin = req.headers.origin;
  if (origin && origin !== 'http://' + host) return false;
  return true;
}
// Browser Fetch Metadata is an additional CSRF boundary for the local API.
// Non-browser clients may omit this header, so this is defense-in-depth, not auth.
function isSameOriginFetch(req) {
  const site = req.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin';
}
function handle(req, res, allow = () => true) {
  // Exported handler is also an entrypoint: callers can bypass createServer().
  // Never process requests if an importer runs it in production mode.
  if (process.env.NODE_ENV === 'production') {
    return send(res, 503, { error: 'development_api_disabled' });
  }
  if (!isLocalRequest(req)) return send(res, 403, { error: 'local_origin_required' });
  // Node can silently retain the first Content-Type when duplicate fields are
  // sent. Reject ambiguous security-sensitive headers before parsing any
  // payload, even when the normalized req.headers value looks acceptable.
  if (Array.isArray(req.rawHeaders)) {
    const sensitive = new Set(['origin', 'sec-fetch-site', 'content-type',
      'content-encoding', 'content-length', 'transfer-encoding']);
    const seen = new Set();
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i];
      if (typeof name !== 'string') {
        return send(res, 400, { error: 'ambiguous_request_headers' });
      }
      const lower = name.toLowerCase();
      if (sensitive.has(lower)) {
        if (seen.has(lower)) {
          return send(res, 400, { error: 'ambiguous_request_headers' });
        }
        seen.add(lower);
      }
    }
  }
  if (req.method === 'GET' && Object.hasOwn(STATIC_FILES, req.url)) {
    return sendStatic(res, req.url);
  }
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { status: 'ok', storage: false, version: '0.30-dev' });
  }
  if (req.method !== 'POST' || req.url !== '/api/cases/validate') {
    return send(res, 404, { error: 'not_found' });
  }
  if (!isSameOriginFetch(req)) {
    return send(res, 403, { error: 'same_origin_required' });
  }
  if (!allow(req.socket.remoteAddress)) {
    return send(res, 429, { error: 'rate_limited' });
  }
  if (!JSON_MEDIA_TYPE.test(req.headers['content-type'] || '')) {
    return send(res, 415, { error: 'json_required' });
  }
  // The API parses raw UTF-8 JSON only. Explicitly reject compressed or
  // unknown request encodings instead of interpreting mislabeled case data.
  const encoding = req.headers['content-encoding'];
  if (encoding !== undefined && encoding.toLowerCase().trim() !== 'identity') {
    return send(res, 415, { error: 'unsupported_content_encoding' });
  }
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > MAX_BODY) {
    return send(res, 413, { error: 'payload_too_large' });
  }
  let size = 0;
  const chunks = [];
  let ended = false;
  req.on('data', chunk => {
    if (ended) return;
    size += chunk.length;
    if (size > MAX_BODY) {
      ended = true;
      send(res, 413, { error: 'payload_too_large' });
      req.resume();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (ended) return;
    let payload;
    try { payload = JSON.parse(strictUtf8.decode(Buffer.concat(chunks))); }
    catch { return send(res, 400, { error: 'invalid_json' }); }
    const result = validateCase(payload);
    // Never reflect case details in response, including on validation failure.
    return send(res, result.valid ? 200 : 422, result);
  });
  req.on('error', () => { if (!res.headersSent) send(res, 400, { error: 'bad_request' }); });
}
function createServer(options = {}) {
  // Also protect importers: a production entrypoint could require this module
  // and call createServer() directly, bypassing the CLI-only guard below.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dadyar development API refuses production mode; no listener started.');
  }
  const allow = createRateLimiter(options.rateLimit);
  // Cap header bytes before request handling to limit oversized-header abuse.
  const server = http.createServer({ maxHeaderSize: 8 * 1024 }, (req, res) => handle(req, res, allow));
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  // A caller importing createServer() must not be able to accidentally
  // expose the unauthenticated development service by choosing 0.0.0.0,
  // ::, an omitted host, a Unix socket or a pre-bound handle.
  // Require an explicit numeric TCP port and literal loopback address.
  const nativeListen = server.listen;
  server.listen = function (...args) {
    // Refuse a late production switch even if the server was created in dev.
    // Listener creation is the final safety boundary before network exposure.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Dadyar development API refuses production mode; no listener started.');
    }
    const first = args[0];
    const options = first && typeof first === 'object' && !Array.isArray(first)
      ? first : null;
    const host = options ? options.host : args[1];
    const port = options ? options.port : first;
    if (!['127.0.0.1', '::1'].includes(host) ||
        typeof port !== 'number' || !Number.isInteger(port) ||
        port < 0 || port > 65535 ||
        (options && Object.keys(options).some(key => !['port', 'host', 'backlog'].includes(key)))) {
      throw new Error('Dadyar development API requires an explicit loopback TCP listener.');
    }
    return nativeListen.apply(this, args);
  };
  return server;
}
if (require.main === module) {
  // Fail closed if this development-only entrypoint is launched as production.
  // This is not a substitute for authentication or a deployment security review.
  if (process.env.NODE_ENV === 'production') {
    console.error('Dadyar development API refuses production mode; no listener started.');
    process.exitCode = 1;
  } else {
    // Intentionally loopback-only; a public deployment needs auth, rate limiting,
    // TLS, threat modeling, audit, gateway rate limiting, and secure persistence decisions.
    const port = Number(process.env.PORT || 8787);
    createServer().listen(port, '127.0.0.1', () => console.log('Dadyar development API listening on loopback port ' + port));
  }
}
module.exports = { createServer, handle, isLocalRequest, isSameOriginFetch, isLoopbackPeer };
