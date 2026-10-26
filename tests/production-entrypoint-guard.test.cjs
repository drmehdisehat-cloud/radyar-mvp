'use strict';
// Production must never launch the unauthenticated development-only API.
// Synthetic process test; no case data, network listener, or secrets needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('development API entrypoint refuses NODE_ENV=production without listening', () => {
  const entrypoint = path.resolve(__dirname, '../backend/server.js');
  const run = spawnSync(process.execPath, [entrypoint], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '0' },
    encoding: 'utf8',
    timeout: 4000,
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 1, 'production entrypoint must exit with failure');
  assert.equal(run.stdout, '', 'must not claim to be listening');
  assert.match(run.stderr, /refuses production mode; no listener started/i);
});

test('imported development API factory refuses NODE_ENV=production', () => {
  const entrypoint = path.resolve(__dirname, '../backend/server.js');
  // A production launcher might import createServer instead of running server.js
  // directly. It must not bypass the same fail-closed production guard.
  const probe = [
    'const { createServer } = require(' + JSON.stringify(entrypoint) + ');',
    'try {',
    '  const server = createServer();',
    '  server.close();',
    '  process.stderr.write("unexpected server creation");',
    '  process.exit(3);',
    '} catch (error) {',
    '  if (!/refuses production mode; no listener started/i.test(String(error.message))) {',
    '    process.stderr.write("unexpected factory error");',
    '    process.exit(2);',
    '  }',
    '  process.stdout.write("blocked");',
    '}',
  ].join('\n');
  const run = spawnSync(process.execPath, ['-e', probe], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '0' },
    encoding: 'utf8',
    timeout: 4000,
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, 'imported factory must refuse to create a server');
  assert.equal(run.stdout, 'blocked');
  assert.equal(run.stderr, '');
});

test('pre-created development API refuses binding after a switch to production', () => {
  const entrypoint = path.resolve(__dirname, '../backend/server.js');
  const probe = [
    'const { createServer } = require(' + JSON.stringify(entrypoint) + ');',
    'const server = createServer();',
    'process.env.NODE_ENV = "production";',
    'try {',
    '  server.listen(0, "127.0.0.1");',
    '  server.close();',
    '  process.stderr.write("unexpected production listener");',
    '  process.exit(3);',
    '} catch (error) {',
    '  if (!/refuses production mode; no listener started/i.test(String(error.message))) {',
    '    process.stderr.write("unexpected bind error");',
    '    process.exit(2);',
    '  }',
    '  if (server.listening) process.exit(4);',
    '  process.stdout.write("blocked");',
    '}',
  ].join('\\n');
  const run = spawnSync(process.execPath, ['-e', probe], {
    env: { ...process.env, NODE_ENV: 'development', PORT: '0' },
    encoding: 'utf8',
    timeout: 4000,
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, 'late production switch must not open a listener');
  assert.equal(run.stdout, 'blocked');
  assert.equal(run.stderr, '');
});
