'use strict';
// Synthetic-only regression: unknown or disguised NODE_ENV values must not
// enable an unauthenticated API. No client records, secrets, or public bind.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const entrypoint = path.resolve(__dirname, '../backend/server.js');
const forbidden = ['Production', 'STAGING', ' preview ', 'qa', 'test', '', 'prod', 'Development'];

function run(mode, args) {
  const result = spawnSync(process.execPath, args, {
    env: { ...process.env, NODE_ENV: mode, PORT: '0' },
    encoding: 'utf8', timeout: 4000,
  });
  if (result.error) throw result.error;
  return result;
}

test('unrecognized NODE_ENV never starts the development CLI listener', () => {
  for (const mode of forbidden) {
    const result = run(mode, [entrypoint]);
    assert.equal(result.status, 1, JSON.stringify(mode) + ': must refuse startup');
    assert.equal(result.stdout, '', JSON.stringify(mode) + ': no listening banner');
    assert.match(result.stderr, /development API refuses .* mode; no listener started/i);
  }
});

test('unrecognized NODE_ENV rejects both imported factory and raw handler', () => {
  const probe = [
    'const { createServer, handle } = require(' + JSON.stringify(entrypoint) + ');',
    'let status, headers, body;',
    'handle({ method: "GET", url: "/health" }, {',
    '  writeHead(code, values) { status = code; headers = values; },',
    '  end(value) { body = JSON.parse(value); }',
    '});',
    'if (status !== 503 || body.error !== "development_api_disabled") process.exit(2);',
    'if (headers["Cache-Control"] !== "no-store") process.exit(3);',
    'try { createServer(); process.exit(4); } catch (error) {',
    '  if (!/development API refuses .* mode; no listener started/i.test(error.message)) process.exit(5);',
    '}',
    'process.stdout.write("blocked");',
  ].join('\\n');
  for (const mode of forbidden) {
    const result = run(mode, ['-e', probe]);
    assert.equal(result.status, 0, JSON.stringify(mode) + ': ' + result.stderr);
    assert.equal(result.stdout, 'blocked');
    assert.equal(result.stderr, '');
  }
});

test('late NODE_ENV change to an unknown mode cannot bind a listener', () => {
  const probe = [
    'const { createServer } = require(' + JSON.stringify(entrypoint) + ');',
    'const server = createServer();',
    'process.env.NODE_ENV = process.argv[1];',
    'try { server.listen(0, "127.0.0.1"); process.exit(2); } catch (error) {',
    '  if (!/development API refuses .* mode; no listener started/i.test(error.message)) process.exit(3);',
    '}',
    'if (server.listening) process.exit(4);',
    'process.stdout.write("blocked");',
  ].join('\\n');
  for (const mode of forbidden) {
    const result = run('development', ['-e', probe, mode]);
    assert.equal(result.status, 0, JSON.stringify(mode) + ': ' + result.stderr);
    assert.equal(result.stdout, 'blocked');
  }
});

test('explicit development and unset NODE_ENV remain usable for local tests', () => {
  const probe = [
    'const { createServer } = require(' + JSON.stringify(entrypoint) + ');',
    'const server = createServer();',
    'if (server.listening) process.exit(2);',
    'process.stdout.write("local");',
  ].join('\\n');
  const dev = run('development', ['-e', probe]);
  assert.equal(dev.status, 0, dev.stderr);
  assert.equal(dev.stdout, 'local');
  const env = { ...process.env, PORT: '0' };
  delete env.NODE_ENV;
  const unset = spawnSync(process.execPath, ['-e', probe], {
    env, encoding: 'utf8', timeout: 4000,
  });
  if (unset.error) throw unset.error;
  assert.equal(unset.status, 0, unset.stderr);
  assert.equal(unset.stdout, 'local');
});
