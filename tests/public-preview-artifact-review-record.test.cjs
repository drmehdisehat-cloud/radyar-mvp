'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-20261122.json'),
  'utf8'
));

test('downloaded preview artifact review record is pinned to its exact source commit and workflow run', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-record-v1');
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.source_branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source_commit, 'f9b44bfe00e2cadbd9598dcead96e71e403b716a');
  assert.equal(record.workflow_name, 'Dadyar public-only preview review artifact');
  assert.equal(record.workflow_run_id, 44990737257);
  assert.equal(record.artifact_id, 14741931459);
  assert.equal(record.archive.file_name, 'dadyar-preview-f9b44bfe.zip');
  assert.equal(record.archive.size_bytes, 17981);
  assert.equal(record.archive.sha256, '3336c3821c4b2a130c8b8ee21030c9884b1626e91bb0b4c42cc98fd383953bde');
});

test('artifact record describes exactly the two downloaded public files and matching digests', () => {
  assert.deepEqual(record.archive.entries.map(entry => entry.path).sort(), ['INTEGRITY.json', 'index.html']);
  const html = record.archive.entries.find(entry => entry.path === 'index.html');
  const manifest = record.archive.entries.find(entry => entry.path === 'INTEGRITY.json');
  assert.equal(html.size_bytes, 60548);
  assert.equal(html.sha256, 'b0d328daecaacbea98d92d3c928909411da906d817ba0a58471af26ea52833bb');
  assert.equal(html.git_blob_sha1, 'b32d86ce81cc9374db2c7e46d7122ce47c2b1065');
  assert.equal(manifest.size_bytes, 862);
  assert.equal(manifest.sha256, '5a0e23ac8beb56220a0a24770e9980428259a6c8870e4e8cc4b328359dfbf9b4');
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
  assert.match(record.verification_scope, /downloaded as ZIP bytes/);
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
