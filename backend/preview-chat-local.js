'use strict';
// Local-only authenticated chat integration harness. Never deploy or expose
// through a reverse proxy. This is NOT a staging or production entrypoint.
const { createPreviewTestServer } = require('./preview-http');
const { createChatHandler } = require('./ai-handler');

function createLocalChatPreview({ env = process.env, answer, now } = {}) {
  // Both the actual process and injected configuration must be development-only.
  // A production-labelled env object must never bypass this local-only guard.
  if ((process.env.NODE_ENV !== undefined && process.env.NODE_ENV !== 'development') ||
      (env.NODE_ENV !== undefined && env.NODE_ENV !== 'development')) {
    throw new Error('Local chat preview refuses non-development mode');
  }
  const handleChat = createChatHandler({ env, answer, now });
  return createPreviewTestServer(env.DADYAR_PREVIEW_TOKEN, (req, res) => {
    if (req.url !== '/api/chat') {
      res.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    Promise.resolve(handleChat(req, (status, data) => {
      if (res.headersSent) return;
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      });
      res.end(JSON.stringify(data));
    })).catch(() => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Cache-Control': 'no-store' });
        res.end();
      }
    });
  });
}
module.exports = { createLocalChatPreview };
