'use strict';
// Synthetic-only regression: importing the raw handler must not bypass the
// production prohibition enforced by createServer() and server.listen().
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('raw development request handler fails closed in production', () => {
  const entrypoint = path.resolve(__dirname, '../backend/server.js');
  const probe = [
    'const { handle } = require(' + JSON.stringify(entrypoint) + ');',
    'const production = process.env.NODE_ENV === "production";',
    'const cases = production ? [["GET", "/health"], ["POST", "/api/cases/validate"]] : [["GET", "/health"]];',
    'for (const [method, url] of cases) {',
    '  let status, headers, body;',
    '  const req = { method, url, headers: { host: "127.0.0.1:8787" },',
    '    socket: { remoteAddress: "127.0.0.1", localPort: 8787 } };',
    '  handle(req, { writeHead(code, values) { status = code; headers = values; },',
    '    end(value) { body = JSON.parse(value); } });',
    '  if (status !== (production ? 503 : 200)) process.exit(2);',
    '  if (production && body.error !== "development_api_disabled") process.exit(3);',
    '  if (!production && body.status !== "ok") process.exit(4);',
    '  if (headers["Cache-Control"] !== "no-store") process.exit(5);',
    '}',
    'process.stdout.write("verified");',
  ].join('\n');
  for (const mode of ['development', 'production']) {
    const run = spawnSync(process.execPath, ['-e', probe], {
      env: { ...process.env, NODE_ENV: mode },
      encoding: 'utf8',
      timeout: 4000,
    });
    if (run.error) throw run.error;
    assert.equal(run.status, 0, mode + ': ' + run.stderr);
    assert.equal(run.stdout, 'verified');
    assert.equal(run.stderr, '');
  }
});
