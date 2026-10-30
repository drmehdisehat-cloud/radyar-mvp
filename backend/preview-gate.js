'use strict';
// Experimental, disconnected HTTP gate. NOT a staging entrypoint or a deployable
// authentication system. Never use with real client data or internet traffic.
const { verifyPreviewBearer } = require('./preview-auth');

const DENIAL_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Length': '0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'WWW-Authenticate': 'Bearer realm="dadyar-preview"',
});

// The caller must supply the expected credential out of band. Deny before
// invoking any downstream handler, including on GET routes or POST requests.
function createPreviewGate(configuredToken, next) {
  if (typeof next !== 'function') throw new TypeError('next must be a function');
  return function previewGate(req, res) {
    if (!verifyPreviewBearer(req, configuredToken)) {
      res.writeHead(401, DENIAL_HEADERS);
      res.end();
      return;
    }
    return next(req, res);
  };
}
module.exports = { createPreviewGate };
