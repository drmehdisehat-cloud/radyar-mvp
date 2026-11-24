'use strict';
// Experimental, disconnected loopback-only harness for synthetic tests.
// NOT a staging server, not wired to backend/server.js, and not deployable.
const http = require('node:http');
const { createPreviewGate } = require('./preview-gate');

const EXPECT_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Length': '0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Connection': 'close',
});

function createPreviewTestServer(configuredToken, next) {
  const server = http.createServer({ maxHeaderSize: 8192 }, createPreviewGate(configuredToken, next));
  // Node sends 100 Continue before calling the normal request handler unless
  // checkContinue is installed. Deny even correctly authenticated uploads:
  // this prototype has no body-handling or staging security review.
  const denyExpect = (_req, res) => {
    res.writeHead(417, EXPECT_HEADERS);
    res.end();
  };
  server.on('checkContinue', denyExpect);
  server.on('checkExpectation', denyExpect);
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  // Prevent this test-only helper from accidentally listening on the network.
  const nativeListen = server.listen;
  server.listen = function (...args) {
    const first = args[0];
    const options = first && typeof first === 'object' && !Array.isArray(first) ? first : null;
    const host = options ? options.host : args[1];
    const port = options ? options.port : first;
    if (!['127.0.0.1', '::1'].includes(host) ||
        typeof port !== 'number' || !Number.isInteger(port) ||
        port < 0 || port > 65535 ||
        (options && Object.keys(options).some(key => !['host', 'port', 'backlog'].includes(key)))) {
      throw new Error('Preview test server requires explicit loopback TCP listener.');
    }
    return nativeListen.apply(this, args);
  };
  return server;
}
module.exports = { createPreviewTestServer };
