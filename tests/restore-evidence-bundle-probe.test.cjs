'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyRestoreEvidenceBundle } = require('../scripts/verify-restore-evidence-bundle.cjs');
const { QUERY } = require('../scripts/probe-isolated-database.cjs');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function probe(overrides = {}) {
  return {
    schema: 'dadyar-isolated-db-probe-v1',
    probe_ok: true,
    query: QUERY,
    database_name: 'stage_db',
    database_user: 'stage_user',
    connection_test_value: 1,
    server_version: '8.0.36',
    restore_target_id: 'sandbox-20261117',
    database_name_separation_verified: true,
    database_user_separation_verified: true,
    observed_at_utc: '2026-11-17T10:05:00.000Z',
    ...overrides
  };
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-bundle-test-'));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const restoreRoot = path.join(root, 'isolated-restore');
  const productionRoot = path.join(root, 'production-document-root');
  const evidenceRoot = path.join(root, 'evidence');
  for (const dir of [restoreRoot, productionRoot, evidenceRoot]) {
    fs.mkdirSync(dir, { mode: 0o700 });
    fs.chmodSync(dir, 0o700);
  }
  const archivePath = path.join(evidenceRoot, 'backup.archive');
  const markerPath = path.join(restoreRoot, 'index.html');
  const restoreLogPath = path.join(evidenceRoot, 'restore.log');
  const databaseProbePath = path.join(evidenceRoot, 'database-probe.json');
  const archiveBytes = Buffer.from('synthetic backup archive bytes');
  const markerBytes = Buffer.from('<html>synthetic restored marker</html>');
  const restoreLogBytes = Buffer.from('synthetic restore completed with exit code 0');
  fs.writeFileSync(archivePath, archiveBytes, { mode: 0o600 });
  fs.writeFileSync(markerPath, markerBytes, { mode: 0o644 });
  fs.writeFileSync(restoreLogPath, restoreLogBytes, { mode: 0o600 });
  const writeProbe = value => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    fs.writeFileSync(databaseProbePath, bytes, { mode: 0o600 });
    fs.chmodSync(databaseProbePath, 0o600);
    manifest.database_probe_sha256 = sha(bytes);
  };
  const manifest = {
    evidence: 'independent-restore-manifest-v1',
    restore_proven: true,
    archive_sha256: sha(archiveBytes),
    restored_marker_sha256: sha(markerBytes),
    restore_log_sha256: sha(restoreLogBytes),
    database_probe_sha256: '',
    restore_exit_code: 0,
    restore_target_isolated: true,
    production_database_untouched: true,
    database_probe_passed: true,
    outbound_integrations_disabled: true,
    reviewer_attested: true,
    restore_target_id: 'sandbox-20261117',
    restore_operator: 'operator-a',
    independent_reviewer: 'reviewer-b',
    restore_database_name: 'stage_db',
    production_database_name: 'production_db',
    restore_database_user: 'stage_user',
    production_database_user: 'production_user',
    restore_target_path: restoreRoot,
    restore_target_realpath: restoreRoot,
    production_document_root: productionRoot,
    production_document_root_realpath: productionRoot,
    restore_completed_at: '2026-11-17T10:00:00.000Z',
    reviewed_at: '2026-11-17T10:10:00.000Z',
    backup_provider: 'iranhost',
    source_site_origin: 'https://mehdisehat.ir',
    backup_id: 'iranhost-backup-20261117-01',
    archive_size_bytes: archiveBytes.length,
    backup_created_at: '2026-11-17T09:00:00.000Z'
  };
  writeProbe(probe());
  return {
    manifest, archivePath, markerPath, restoreLogPath, databaseProbePath,
    writeProbe,
    verify() {
      return verifyRestoreEvidenceBundle({
        manifest,
        archivePath,
        restoredMarkerPath: markerPath,
        restoreLogPath,
        databaseProbePath
      });
    }
  };
}

test('requires a schema-valid read-only DB probe matching the isolated restore identity', t => {
  const f = fixture(t);
  const result = f.verify();
  assert.equal(result.matched, true);
  assert.equal(result.database_probe_schema_verified, true);
  assert.equal(result.restore_operation_independently_verified, false);
  assert.equal(result.signer_identity_verified, false);
  assert.equal(result.deployment_authorized, false);
});

test('rejects a DB probe that points to the production database or user even when its hash matches', t => {
  for (const patch of [
    { database_name: 'production_db' },
    { database_user: 'production_user' }
  ]) {
    const f = fixture(t);
    f.writeProbe(probe(patch));
    assert.throws(() => f.verify(), /database_probe_identity_mismatch/);
  }
});

test('rejects a probe bound to another restore target or outside the restore-review time window', t => {
  const wrongTarget = fixture(t);
  wrongTarget.writeProbe(probe({ restore_target_id: 'other-sandbox' }));
  assert.throws(() => wrongTarget.verify(), /database_probe_identity_mismatch/);

  const wrongTime = fixture(t);
  wrongTime.writeProbe(probe({ observed_at_utc: '2026-11-17T09:59:00.000Z' }));
  assert.throws(() => wrongTime.verify(), /database_probe_timestamp_outside_restore_review_window/);
});

test('rejects duplicate-key JSON, unknown fields and failed SELECT results', t => {
  const duplicate = fixture(t);
  const valid = probe();
  const duplicateJson = JSON.stringify(valid).replace('"probe_ok":true', '"probe_ok":true,"probe_ok":true');
  duplicate.writeProbe(duplicateJson);
  assert.throws(() => duplicate.verify(), /duplicate_json_key/);

  const unknown = fixture(t);
  unknown.writeProbe(probe({ credential: 'must-not-be-present' }));
  assert.throws(() => unknown.verify(), /database_probe_schema_keys_invalid/);

  const failed = fixture(t);
  failed.writeProbe(probe({ probe_ok: false }));
  assert.throws(() => failed.verify(), /database_probe_result_invalid/);
});
