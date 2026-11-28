'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probeIsolatedDatabase, parseArgs, QUERY } = require('../scripts/probe-isolated-database.cjs');

function fixture(t, content = '[client]\nuser=stage_user\npassword=synthetic-password\nhost=127.0.0.1\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-db-probe-test-'));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const defaultsFile = path.join(root, 'staging.cnf');
  fs.writeFileSync(defaultsFile, content, { mode: 0o600 });
  fs.chmodSync(defaultsFile, 0o600);
  return { root, defaultsFile };
}

const options = defaultsFile => ({
  defaultsFile,
  expectedDatabase: 'stage_db',
  expectedUser: 'stage_user',
  productionDatabase: 'production_db',
  productionUser: 'production_user',
  restoreTargetId: 'iranhost-sandbox-20261117',
  now: () => '2026-11-17T10:05:00.000Z'
});

test('runs one read-only identity probe using a private temporary copy of the defaults file', t => {
  const f = fixture(t);
  let temporaryFile;
  const result = probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn(binary, args, config) {
      assert.equal(binary, 'mysql');
      assert.ok(args[0].startsWith('--defaults-file='));
      temporaryFile = args[0].slice('--defaults-file='.length);
      assert.equal(fs.readFileSync(temporaryFile, 'utf8'), fs.readFileSync(f.defaultsFile, 'utf8'));
      assert.equal(fs.statSync(temporaryFile).mode & 0o777, 0o600);
      assert.equal(args[1], '--user=stage_user');
      assert.equal(args[2], '--database=stage_db');
      assert.ok(args.includes('--execute'));
      assert.equal(args[args.indexOf('--execute') + 1], QUERY);
      assert.equal(config.timeout, 10000);
      assert.equal(config.maxBuffer, 4096);
      assert.equal(config.env.MYSQL_PWD, undefined);
      assert.equal(config.env.HOME, path.dirname(temporaryFile));
      return { status: 0, stdout: 'stage_db\tstage_user\t1\t8.0.36\n', stderr: 'must-not-be-returned' };
    }
  });
  assert.equal(result.probe_ok, true);
  assert.equal(result.database_name, 'stage_db');
  assert.equal(result.database_user, 'stage_user');
  assert.equal(result.connection_test_value, 1);
  assert.equal(result.restore_target_id, 'iranhost-sandbox-20261117');
  assert.equal(result.observed_at_utc, '2026-11-17T10:05:00.000Z');
  assert.equal(JSON.stringify(result).includes('synthetic-password'), false);
  assert.equal(fs.existsSync(path.dirname(temporaryFile)), false, 'temporary credential copy must be removed');
});

test('rejects a connection that lands on the production database or user', t => {
  const f = fixture(t);
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => ({ status: 0, stdout: 'production_db\tstage_user\t1\t8.0.36\n' })
  }), error => error.code === 'database_probe_identity_mismatch');
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => ({ status: 0, stdout: 'stage_db\tproduction_user\t1\t8.0.36\n' })
  }), error => error.code === 'database_probe_identity_mismatch');
});

test('rejects client errors and malformed or multi-row output without reflecting stderr', t => {
  const f = fixture(t);
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => ({ status: 1, stdout: '', stderr: 'synthetic-password' })
  }), error => error.code === 'mysql_client_failed');
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => ({ status: 0, stdout: 'stage_db\tstage_user\t0\t8.0.36\n' })
  }), error => error.code === 'database_probe_output_invalid');
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => ({ status: 0, stdout: 'stage_db\tstage_user\t1\t8.0.36\nstage_db\tstage_user\t1\t8.0.36\n' })
  }), error => error.code === 'database_probe_output_invalid');
});

test('rejects production database reuse before starting a client process', t => {
  const f = fixture(t);
  let invoked = false;
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    productionDatabase: 'stage_db',
    spawn: () => { invoked = true; return { status: 0, stdout: '' }; }
  }), error => error.code === 'production_database_or_user_reused');
  assert.equal(invoked, false);
});

test('rejects defaults files with includes, unsupported options, or another option group', t => {
  for (const content of [
    '[client]\n!include /tmp/other.cnf\n',
    '[client]\ninit-command=DROP DATABASE production_db\n',
    '[client]\npassword=synthetic\n[mysql]\nuser=stage_user\n'
  ]) {
    const f = fixture(t, content);
    assert.throws(() => probeIsolatedDatabase({
      ...options(f.defaultsFile),
      spawn: () => { throw new Error('must not run'); }
    }));
  }
});

test('rejects group-readable defaults files and symlink aliases', t => {
  const f = fixture(t);
  fs.chmodSync(f.defaultsFile, 0o640);
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => { throw new Error('must not run'); }
  }), error => error.code === 'defaults_file_must_be_owner_only');
  fs.chmodSync(f.defaultsFile, 0o600);
  const link = path.join(f.root, 'alias.cnf');
  fs.symlinkSync(f.defaultsFile, link);
  assert.throws(() => probeIsolatedDatabase({
    ...options(link),
    spawn: () => { throw new Error('must not run'); }
  }), error => error.code === 'defaults_file_symlink_forbidden');
});

test('parses a complete argument set and rejects duplicate or unknown flags', () => {
  const args = [
    '--defaults-file', '/secure/mysql.cnf',
    '--expected-database', 'stage_db',
    '--expected-user', 'stage_user',
    '--production-database', 'prod_db',
    '--production-user', 'prod_user',
    '--restore-target-id', 'sandbox-1'
  ];
  assert.equal(parseArgs(args).values['--expected-database'], 'stage_db');
  assert.throws(() => parseArgs([...args, '--expected-user', 'other']));
  assert.throws(() => parseArgs([...args, '--surprise', 'value']));
});
