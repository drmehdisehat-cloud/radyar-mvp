'use strict';
// Synthetic-only deployment guard regression. No client data, keys or listener.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const entrypoint = path.resolve(__dirname, '../backend/server.js');
const modes = ['staging', 'preview'];

function run(mode, args) {
  const result = spawnSync(process.execPath, args, {
    env: { ...process.env, NODE_ENV: mode, PORT: '0' },
    encoding: 'utf8', timeout: 4000,
  });
  if (result.error) throw result.error;
  return result;
}

test('staging and preview CLI entrypoints refuse to listen', () => {
  for (const mode of modes) {
    const result = run(mode, [entrypoint]);
    assert.equal(result.status, 1, mode + ': must fail closed');
    assert.equal(result.stdout, '', mode + ': no listener announcement');
    assert.match(result.stderr, new RegExp('refuses ' + mode + ' mode; no listener started', 'i'));
  }
});

test('staging and preview reject imported factory and raw handler', () => {
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
    '  if (!String(error.message).includes("refuses " + process.env.NODE_ENV + " mode")) process.exit(5);',
    '}',
    'process.stdout.write("blocked");',
  ].join('\n');
  for (const mode of modes) {
    const result = run(mode, ['-e', probe]);
    assert.equal(result.status, 0, mode + ': ' + result.stderr);
    assert.equal(result.stdout, 'blocked');
    assert.equal(result.stderr, '');
  }
});

test('late switch to staging or preview cannot open a pre-created listener', () => {
  const probe = [
    'const { createServer } = require(' + JSON.stringify(entrypoint) + ');',
    'const server = createServer();',
    'process.env.NODE_ENV = process.argv[1];',
    'try { server.listen(0, "127.0.0.1"); process.exit(4); } catch (error) {',
    '  if (!String(error.message).includes("refuses " + process.env.NODE_ENV + " mode")) process.exit(5);',
    '}',
    'if (server.listening) process.exit(6);',
    'process.stdout.write("blocked");',
  ].join('\n');
  for (const mode of modes) {
    const result = run('development', ['-e', probe, mode]);
    assert.equal(result.status, 0, mode + ': ' + result.stderr);
    assert.equal(result.stdout, 'blocked');
    assert.equal(result.stderr, '');
  }
});
