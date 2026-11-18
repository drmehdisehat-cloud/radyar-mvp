'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probeIsolatedDatabase } = require('../scripts/probe-isolated-database.cjs');

test('isolated database probe ignores caller-controlled PATH and uses only system directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-db-probe-path-'));
  const defaultsFile = path.join(root, 'staging-client.cnf');
  fs.writeFileSync(defaultsFile, [
    '[client]',
    'user=synthetic_stage_user',
    'password=synthetic-only-not-a-secret',
    'host=127.0.0.1',
    ''
  ].join('\\n'), { mode: 0o600 });

  const originalPath = process.env.PATH;
  let invocation;
  try {
    process.env.PATH = '/tmp/dadyar-untrusted-bin';
    const result = probeIsolatedDatabase({
      defaultsFile,
      expectedDatabase: 'synthetic_stage_db',
      expectedUser: 'synthetic_stage_user',
      productionDatabase: 'synthetic_live_db',
      productionUser: 'synthetic_live_user',
      restoreTargetId: 'synthetic-sandbox-1',
      now: () => '2026-11-18T13:00:00.000Z',
      spawn(binary, args, options) {
        invocation = { binary, args, options };
        return {
          status: 0,
          stdout: 'synthetic_stage_db\\tsynthetic_stage_user\\t1\\t8.0.36\\n',
          stderr: ''
        };
      }
    });

    assert.equal(result.probe_ok, true);
    assert.equal(result.database_name, 'synthetic_stage_db');
    assert.equal(result.database_user, 'synthetic_stage_user');
    assert.equal(invocation.binary, 'mysql');
    assert.equal(invocation.options.env.PATH, '/usr/bin:/bin');
    assert.equal(invocation.options.env.PATH.includes('/tmp/dadyar-untrusted-bin'), false);
    assert.deepEqual(Object.keys(invocation.options.env).sort(), ['HOME', 'LANG', 'LC_ALL', 'PATH']);
    assert.equal(invocation.options.env.LANG, 'C');
    assert.equal(invocation.options.env.LC_ALL, 'C');
    assert.equal(invocation.options.timeout, 10000);
    assert.equal(invocation.options.maxBuffer, 4096);
    assert.match(invocation.args[0], /^--defaults-file=\\/.*\\/client\\.cnf$/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
