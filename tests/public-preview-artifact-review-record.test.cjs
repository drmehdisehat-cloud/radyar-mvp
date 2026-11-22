'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-20261122.json'),
  'utf8'
));

test('downloaded preview artifact review record is pinned to the exact current branch head and workflow run', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-record-v1');
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.source_branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source_commit, '09d30c8629cce50a7d6272440d1712d3c6de4e22');
  assert.equal(record.workflow_name, 'Dadyar public-only preview review artifact');
  assert.equal(record.workflow_run_id, 44994500093);
  assert.equal(record.artifact_id, 14743491060);
  assert.equal(record.artifact_name, 'dadyar-public-preview-review-09d30c8629cce50a7d6272440d1712d3c6de4e22');
  assert.equal(record.archive.file_name, 'dadyar-preview-09d30c8.zip');
  assert.equal(record.archive.size_bytes, 17980);
  assert.equal(record.archive.sha256, '52739f2c81fab77f7d9cfd77413410e8ff84caa1ef19d1d7f50ca25d32fc026e');
  assert.equal(record.checks.artifact_metadata_matches_run, true);
  assert.equal(record.checks.archive_sha256_matches_workflow_log, true);
  assert.equal(record.checks.html_git_blob_sha1_matches_branch_source, true);
});

test('artifact record describes exactly the two downloaded public files and matching digests', () => {
  assert.deepEqual(record.archive.entries.map(entry => entry.path).sort(), ['INTEGRITY.json', 'index.html']);
  const html = record.archive.entries.find(entry => entry.path === 'index.html');
  const manifest = record.archive.entries.find(entry => entry.path === 'INTEGRITY.json');
  assert.equal(html.size_bytes, 60548);
  assert.equal(html.sha256, 'b0d328daecaacbea98d92d3c928909411da906d817ba0a58471af26ea52833bb');
  assert.equal(html.git_blob_sha1, 'b32d86ce81cc9374db2c7e46d7122ce47c2b1065');
  assert.equal(manifest.size_bytes, 862);
  assert.equal(manifest.sha256, '5508940d04781146c6e5fac170d9bfbfe444b9d0fc06eec0a8516660514763f1');
  assert.equal(record.checks.zip_listing_exact, true);
  assert.equal(record.checks.zip_integrity_test, true);
  assert.equal(record.checks.manifest_json_parsed, true);
  assert.equal(record.checks.html_sha256_matches_manifest, true);
  assert.equal(record.checks.html_git_blob_sha1_matches_manifest, true);
  assert.equal(record.checks.source_commit_matches_manifest, true);
  assert.equal(record.checks.workflow_commit_matches_manifest, true);
  assert.equal(record.checks.source_branch_matches_manifest, true);
  assert.equal(record.checks.target_subpath_matches, '/dadyar-preview/');
});

test('artifact byte verification never promotes review bytes to restore, authentication or deployment proof', () => {
  assert.equal(record.checks.api_enabled, false);
  assert.equal(record.checks.public_ai_enabled, false);
  assert.equal(record.checks.reviewer_authentication, 'not-implemented');
  assert.equal(record.checks.backup_restore_verified, false);
  assert.equal(record.checks.destination_verified, false);
  assert.equal(record.checks.deployment_authorized, false);
  assert.match(record.verification_scope, /downloaded as bytes/);
  assert.ok(record.limitations.some(value => /does not prove a real backup restore/.test(value)));
  assert.ok(record.limitations.some(value => /Do not upload/.test(value)));
});

test('artifact review record contains digest-only evidence and no credentials or client payload', () => {
  assert.match(record.archive.sha256, /^[a-f0-9]{64}$/);
  assert.match(record.source_commit, /^[a-f0-9]{40}$/);
  for (const entry of record.archive.entries) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(entry.size_bytes) && entry.size_bytes > 0);
  }
  const serialized = JSON.stringify(record).toLowerCase();
  for (const forbidden of ['private_key', 'api_key', 'password', 'client_record', 'backup_archive_content']) {
    assert.equal(serialized.includes(forbidden), false, 'review record must not contain ' + forbidden);
  }
});
