'use strict';
// Synthetic process regression: staging and preview are not authenticated
// environments and must never expose the development-only API.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const entrypoint = path.resolve(__dirname, '../backend/server.js');
function runNode(args, mode) {
  const run = spawnSync(process.execPath, args, {
    env: { ...process.env, NODE_ENV: mode, PORT: '0' },
    encoding: 'utf8',
    timeout: 4000,
  });
  if (run.error) throw run.error;
  return run;
}

for (const mode of ['staging', 'preview']) {
  test(mode + ' refuses CLI startup without opening a listener', () => {
    const run = runNode([entrypoint], mode);
    assert.equal(run.status, 1);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, new RegExp('refuses ' + mode + ' mode; no listener started'));
  });

  test(mode + ' refuses imported factory and raw handler', () => {
    const probe = [
      'const { createServer, handle } = require(' + JSON.stringify(entrypoint) + ');',
      'try { createServer(); process.exit(2); }',
      'catch (e) { if (!/refuses (staging|preview) mode/.test(e.message)) process.exit(3); }',
      'let status, headers, body;',
      'handle({ method: "POST", url: "/api/cases/validate",',
      '  headers: { host: "127.0.0.1:8787" },',
      '  socket: { remoteAddress: "127.0.0.1", localPort: 8787 } },',
      '  { writeHead(code, values) { status = code; headers = values; },',
      '    end(value) { body = JSON.parse(value); } });',
      'if (status !== 503 || body.error !== "development_api_disabled") process.exit(4);',
      'if (headers["Cache-Control"] !== "no-store") process.exit(5);',
      'process.stdout.write("blocked");',
    ].join('\n');
    const run = runNode(['-e', probe], mode);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, 'blocked');
    assert.equal(run.stderr, '');
  });

  test(mode + ' blocks a late environment switch before listen', () => {
    const probe = [
      'const { createServer } = require(' + JSON.stringify(entrypoint) + ');',
      'const server = createServer();',
      'process.env.NODE_ENV = ' + JSON.stringify(mode) + ';',
      'try { server.listen(0, "127.0.0.1"); process.exit(2); }',
      'catch (e) { if (!/refuses (staging|preview) mode/.test(e.message)) process.exit(3); }',
      'if (server.listening) process.exit(4);',
      'process.stdout.write("blocked");',
    ].join('\n');
    const run = runNode(['-e', probe], 'development');
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, 'blocked');
    assert.equal(run.stderr, '');
  });
}
