'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyRestoreEvidenceBundle } = require('../scripts/verify-restore-evidence-bundle.cjs');

const SCRIPT = path.join(__dirname, '../scripts/verify-restore-evidence-bundle.cjs');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function makeFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-evidence-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const contents = {
    archive: Buffer.from('synthetic backup archive bytes'),
    restored_marker: Buffer.from('synthetic restored marker'),
    restore_log: Buffer.from('synthetic restore completed; exit=0'),
    database_probe: Buffer.from('{"synthetic":true,"database_probe_passed":true}')
  };
  const paths = {};
  for (const [name, bytes] of Object.entries(contents)) {
    paths[name] = path.join(directory, name + '.evidence');
    fs.writeFileSync(paths[name], bytes, { mode: 0o600 });
  }
  const now = Date.now();
  const manifest = {
    evidence: 'independent-restore-manifest-v1',
    restore_proven: true,
    archive_sha256: digest(contents.archive),
    restored_marker_sha256: digest(contents.restored_marker),
    restore_log_sha256: digest(contents.restore_log),
    database_probe_sha256: digest(contents.database_probe),
    restore_exit_code: 0,
    restore_target_isolated: true,
    production_database_untouched: true,
    database_probe_passed: true,
    outbound_integrations_disabled: true,
    reviewer_attested: true,
    restore_target_id: 'synthetic-isolated-target',
    restore_operator: 'Synthetic Operator',
    independent_reviewer: 'Synthetic Reviewer',
    restore_database_name: 'synthetic_restore_db',
    production_database_name: 'synthetic_live_db',
    restore_database_user: 'synthetic_restore_user',
    production_database_user: 'synthetic_live_user',
    restore_target_path: '/srv/synthetic/restore',
    restore_target_realpath: '/srv/synthetic/restore',
    production_document_root: '/srv/site/public_html',
    production_document_root_realpath: '/srv/site/public_html',
    restore_completed_at: new Date(now - 120000).toISOString(),
    reviewed_at: new Date(now - 60000).toISOString()
  };
  return { directory, contents, paths, manifest };
}

function verify(fixture, overrides = {}) {
  return verifyRestoreEvidenceBundle({
    manifest: fixture.manifest,
    archivePath: fixture.paths.archive,
    restoredMarkerPath: fixture.paths.restored_marker,
    restoreLogPath: fixture.paths.restore_log,
    databaseProbePath: fixture.paths.database_probe,
    ...overrides
  });
}

test('all four external evidence files match the manifest without claiming restore proof', t => {
  const fixture = makeFixture(t);
  const result = verify(fixture);
  assert.equal(result.status, 'EVIDENCE_BYTES_MATCH_MANIFEST_NOT_RESTORE_PROOF');
  assert.equal(result.matched, true);
  assert.deepEqual(Object.keys(result.files).sort(), ['archive', 'database_probe', 'restore_log', 'restored_marker']);
  assert.equal(result.restore_operation_independently_verified, false);
  assert.equal(result.signer_identity_verified, false);
  assert.equal(result.deployment_authorized, false);
});

for (const [label, field] of [
  ['archive', 'archive_sha256'],
  ['restored marker', 'restored_marker_sha256'],
  ['restore log', 'restore_log_sha256'],
  ['database probe', 'database_probe_sha256']
]) {
  test('rejects tampered ' + label + ' bytes', t => {
    const fixture = makeFixture(t);
    const key = label === 'restored marker' ? 'restored_marker' : label === 'database probe' ? 'database_probe' : label.replaceAll(' ', '_');
    fs.appendFileSync(fixture.paths[key], Buffer.from('tamper'));
    assert.throws(() => verify(fixture), new RegExp(key + '_sha256_mismatch'));
    assert.equal(typeof fixture.manifest[field], 'string');
  });
}

test('rejects reusing one file for two evidence roles', t => {
  const fixture = makeFixture(t);
  assert.throws(() => verify(fixture, { restoredMarkerPath: fixture.paths.archive }), /must_be_a_distinct_evidence_file/);
});

test('rejects evidence files inside the Git checkout', t => {
  const fixture = makeFixture(t);
  assert.throws(() => verify(fixture, { archivePath: __filename }), /archive_path_inside_git_checkout/);
});

test('rejects symlinked evidence paths', t => {
  const fixture = makeFixture(t);
  const alias = path.join(fixture.directory, 'archive-link');
  fs.symlinkSync(fixture.paths.archive, alias);
  assert.throws(() => verify(fixture, { archivePath: alias }), /archive_path_contains_symlink/);
});

test('CLI verifies synthetic external evidence and emits non-authorizing status', t => {
  const fixture = makeFixture(t);
  const manifestPath = path.join(fixture.directory, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(fixture.manifest), { mode: 0o600 });
  const result = spawnSync(process.execPath, [
    SCRIPT,
    '--manifest', manifestPath,
    '--archive', fixture.paths.archive,
    '--restored-marker', fixture.paths.restored_marker,
    '--restore-log', fixture.paths.restore_log,
    '--database-probe', fixture.paths.database_probe
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.matched, true);
  assert.equal(output.deployment_authorized, false);
});

test('rejects FIFOs without blocking the verifier', t => {
  if (process.platform === 'win32') return t.skip('mkfifo is POSIX-only');
  const fixture = makeFixture(t);
  const fifo = path.join(fixture.directory, 'archive.pipe');
  const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  if (created.error || created.status !== 0) return t.skip('mkfifo unavailable');
  const manifestPath = path.join(fixture.directory, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(fixture.manifest), { mode: 0o600 });
  const result = spawnSync(process.execPath, [
    SCRIPT,
    '--manifest', manifestPath,
    '--archive', fifo,
    '--restored-marker', fixture.paths.restored_marker,
    '--restore-log', fixture.paths.restore_log,
    '--database-probe', fixture.paths.database_probe
  ], { encoding: 'utf8', timeout: 2000 });
  assert.notEqual(result.error?.code, 'ETIMEDOUT', 'FIFO evidence must not block the CLI');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /archive_must_be_regular_file/);
});
