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
