'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '../scripts/preview-release-preflight.cjs');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-release-preflight-'));
  const restoreCompleted = new Date(Date.now() - 120000).toISOString();
  const reviewed = new Date(Date.now() - 60000).toISOString();
  const restore = {
    evidence: 'independent-restore-manifest-v1',
    restore_proven: true,
    archive_sha256: digest('synthetic archive'),
    restored_marker_sha256: digest('synthetic marker'),
    restore_log_sha256: digest('synthetic restore log'),
    database_probe_sha256: digest('synthetic database probe'),
    restore_exit_code: 0,
    restore_target_isolated: true,
    production_database_untouched: true,
    database_probe_passed: true,
    outbound_integrations_disabled: true,
    reviewer_attested: true,
    restore_target_id: 'synthetic-isolated-target',
    restore_target_path: '/srv/dadyar-synthetic-restore',
    restore_target_realpath: '/srv/dadyar-synthetic-restore',
    production_document_root: '/var/www/production',
    production_document_root_realpath: '/var/www/production',
    restore_database_name: 'synthetic_staging_db',
    production_database_name: 'synthetic_production_db',
    restore_database_user: 'synthetic_staging_user',
    production_database_user: 'synthetic_production_user',
    restore_operator: 'Synthetic Operator',
    independent_reviewer: 'Synthetic Reviewer',
    restore_completed_at: restoreCompleted,
    reviewed_at: reviewed
  };
  const sourceHash = digest('synthetic reviewed preview');
  const destination = {
    matched: true,
    destination_outside_document_root: true,
    source_blob_sha1: crypto.createHash('sha1').update('synthetic git blob').digest('hex'),
    expected_source_blob_sha1: crypto.createHash('sha1').update('synthetic git blob').digest('hex'),
    source_sha256: sourceHash,
    destination_sha256: sourceHash,
    destination_realpath: '/srv/dadyar-staging/preview/index.html',
    production_document_root_realpath: '/var/www/production'
  };
  const restoreFile = path.join(directory, 'restore.json');
  const destinationFile = path.join(directory, 'destination.json');
  fs.writeFileSync(restoreFile, JSON.stringify(restore));
  fs.writeFileSync(destinationFile, JSON.stringify(destination));
  return { directory, restoreFile, destinationFile };
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 5000 });
}

function baseArgs(f) {
  return [
    '--restore-evidence', f.restoreFile,
    '--destination-evidence', f.destinationFile,
    '--isolated-restore-verified',
    '--mobile-browser-verified',
    '--zero-api-requests-verified',
    '--human-review-verified'
  ];
}

test('read-only CLI reaches owner-approval state only when all synthetic gates are supplied', () => {
  const f = fixture();
  try {
    const result = run(baseArgs(f));
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'READY_FOR_OWNER_DEPLOYMENT_APPROVAL');
    assert.deepEqual(report.blockers, []);
    assert.equal(report.evidenceFilesRead, true);
    assert.equal(report.attestationFlagsSupplied, 4);
    assert.equal(report.deploymentPerformed, false);
    assert.match(report.note, /مستقل احراز نمی‌کند/);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('missing mobile or zero-network attestation fails closed and never deploys', () => {
  const f = fixture();
  try {
    const args = baseArgs(f).filter(arg => arg !== '--zero-api-requests-verified');
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.ok(report.blockers.some(item => /zero API requests/i.test(item)));
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('evidence files inside the Git checkout are rejected before parsing', () => {
  const f = fixture();
  try {
    const result = run([
      '--restore-evidence', __filename,
      '--destination-evidence', f.destinationFile,
      '--isolated-restore-verified',
      '--mobile-browser-verified',
      '--zero-api-requests-verified',
      '--human-review-verified'
    ]);
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.match(report.blockers.join(' '), /outside_git_checkout/);
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('symlinked evidence paths are rejected', () => {
  const f = fixture();
  const alias = path.join(f.directory, 'restore-alias.json');
  try {
    fs.symlinkSync(f.restoreFile, alias);
    const result = run([
      '--restore-evidence', alias,
      '--destination-evidence', f.destinationFile,
      '--isolated-restore-verified',
      '--mobile-browser-verified',
      '--zero-api-requests-verified',
      '--human-review-verified'
    ]);
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout);
    assert.match(report.blockers.join(' '), /symlink/);
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('unknown deploy-like options are rejected and the CLI exposes no deploy command', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /read-only/);
  assert.match(help.stdout, /never deploys/);
  const result = run(['--deploy']);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'NOT_READY');
  assert.match(report.blockers.join(' '), /unknown_argument/);
  assert.equal(report.deploymentPerformed, false);
});
