'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probeIsolatedDatabase, QUERY } = require('../scripts/probe-isolated-database.cjs');

function fixture(t, extra = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-db-transport-'));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const caFile = path.join(root, 'iranhost-ca.pem');
  fs.writeFileSync(caFile, 'synthetic public CA certificate bytes\n', { mode: 0o644 });
  const defaultsFile = path.join(root, 'staging.cnf');
  const lines = [
    '[client]',
    'user=stage_user',
    'password=synthetic-password',
    ...extra
  ];
  fs.writeFileSync(defaultsFile, lines.join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(defaultsFile, 0o600);
  return { root, caFile, defaultsFile };
}

function options(defaultsFile) {
  return {
    defaultsFile,
    expectedDatabase: 'stage_db',
    expectedUser: 'stage_user',
    productionDatabase: 'production_db',
    productionUser: 'production_user',
    restoreTargetId: 'synthetic-sandbox-transport-01',
    now: () => '2026-11-25T07:00:00.000Z'
  };
}

test('rejects remote MySQL over plaintext before starting the client', t => {
  const f = fixture(t, ['host=db.iranhost.example', 'protocol=TCP']);
  let invoked = false;
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => { invoked = true; return { status: 0, stdout: '' }; }
  }), error => error.code === 'remote_database_requires_ssl_verify_identity');
  assert.equal(invoked, false);
});

test('rejects remote MySQL VERIFY_CA because hostname identity must also be checked', t => {
  const f = fixture(t, [
    'host=db.iranhost.example',
    'protocol=TCP',
    'ssl-mode=VERIFY_CA',
    'ssl-ca=' + path.join(os.tmpdir(), 'unused-ca.pem')
  ]);
  let invoked = false;
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => { invoked = true; return { status: 0, stdout: '' }; }
  }), error => error.code === 'remote_database_requires_ssl_verify_identity');
  assert.equal(invoked, false);
});

test('requires explicit TCP for a remote database endpoint', t => {
  const f = fixture(t, [
    'host=db.iranhost.example',
    'ssl-mode=VERIFY_IDENTITY',
    'ssl-ca=' + path.join(os.tmpdir(), 'unused-ca.pem')
  ]);
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => { throw new Error('must not run'); }
  }), error => error.code === 'remote_database_requires_explicit_tcp');
});

test('does not misclassify malformed 127-prefixed host labels as loopback', t => {
  const f = fixture(t, ['host=127.database.iranhost.example', 'protocol=TCP']);
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => { throw new Error('must not run'); }
  }), error => error.code === 'remote_database_requires_ssl_verify_identity');
});

test('requires an absolute CA path for remote TLS identity verification', t => {
  const f = fixture(t, [
    'host=db.iranhost.example',
    'protocol=TCP',
    'ssl-mode=VERIFY_IDENTITY',
    'ssl-ca=relative/ca.pem'
  ]);
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => { throw new Error('must not run'); }
  }), error => error.code === 'remote_database_requires_absolute_ssl_ca');
});

test('rejects a symlinked remote TLS CA path', t => {
  const f = fixture(t, [
    'host=db.iranhost.example',
    'protocol=TCP',
    'ssl-mode=VERIFY_IDENTITY'
  ]);
  const alias = path.join(f.root, 'ca-alias.pem');
  fs.symlinkSync(f.caFile, alias);
  fs.appendFileSync(f.defaultsFile, 'ssl-ca=' + alias + '\n');
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => { throw new Error('must not run'); }
  }), error => error.code === 'ssl_ca_symlink_forbidden');
});

test('rejects remote TLS CA files with group/world write permission', t => {
  const f = fixture(t, [
    'host=db.iranhost.example',
    'protocol=TCP',
    'ssl-mode=VERIFY_IDENTITY'
  ]);
  fs.chmodSync(f.caFile, 0o666);
  fs.appendFileSync(f.defaultsFile, 'ssl-ca=' + f.caFile + '\n');
  assert.throws(() => probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => { throw new Error('must not run'); }
  }), error => error.code === 'ssl_ca_permissions_invalid');
});

test('accepts remote MySQL only with TCP, VERIFY_IDENTITY and a stable external CA file', t => {
  const f = fixture(t, [
    'host=db.iranhost.example',
    'protocol=TCP',
    'ssl-mode=VERIFY_IDENTITY',
    'ssl-ca=' + f.caFile
  ]);
  let observed;
  const result = probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn(binary, args, config) {
      observed = {
        binary,
        args,
        config,
        copiedDefaults: fs.readFileSync(args[0].slice('--defaults-file='.length), 'utf8')
      };
      return { status: 0, stdout: 'stage_db\tstage_user\t1\t8.0.36\n', stderr: '' };
    }
  });
  assert.equal(result.probe_ok, true);
  assert.equal(result.database_name, 'stage_db');
  assert.equal(observed.binary, 'mysql');
  assert.equal(observed.args[observed.args.indexOf('--execute') + 1], QUERY);
  assert.match(observed.copiedDefaults, /ssl-mode=VERIFY_IDENTITY/);
  assert.ok(observed.copiedDefaults.includes('ssl-ca=' + f.caFile));
  assert.equal(observed.config.env.MYSQL_PWD, undefined);
  assert.equal(JSON.stringify(result).includes('synthetic-password'), false);
});

test('accepts remote MariaDB only with server-certificate verification and a stable external CA file', t => {
  const f = fixture(t, [
    'host=db.iranhost.example',
    'protocol=TCP',
    'ssl-verify-server-cert=1',
    'ssl-ca=' + f.caFile
  ]);
  const result = probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => ({ status: 0, stdout: 'stage_db\tstage_user\t1\t10.11.8-MariaDB\n', stderr: '' })
  });
  assert.equal(result.probe_ok, true);
  assert.equal(result.server_version, '10.11.8-MariaDB');
});

test('keeps loopback MySQL available without remote TLS configuration', t => {
  const f = fixture(t, ['host=127.0.0.2']);
  const result = probeIsolatedDatabase({
    ...options(f.defaultsFile),
    spawn: () => ({ status: 0, stdout: 'stage_db\tstage_user\t1\t8.0.36\n', stderr: '' })
  });
  assert.equal(result.probe_ok, true);
});
