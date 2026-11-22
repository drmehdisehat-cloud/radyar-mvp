'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-bbf20ce1-20261122.json'),
  'utf8'
));

test('bbf20ce preview review record is pinned to the exact successful push and artifact', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-record-v1');
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.source_branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source_commit, 'bbf20ce1940727dbc15852e08053cc96772e3e09');
  assert.equal(record.workflow_name, 'Dadyar public-only preview review artifact');
  assert.equal(record.workflow_path, '.github/workflows/public-preview-review-artifact.yml');
  assert.equal(record.workflow_run_id, 45008714094);
  assert.equal(record.workflow_event, 'push');
  assert.equal(record.workflow_conclusion, 'success');
  assert.equal(record.artifact_id, 14748826741);
  assert.equal(record.artifact_name, 'dadyar-public-preview-review-bbf20ce1940727dbc15852e08053cc96772e3e09');
  assert.equal(record.archive.size_bytes, 17980);
  assert.equal(record.archive.sha256, '844d96533ffeb3439b00bc62aa41fa8fa2465ab36cc081341bb3c45b0dfeeba2');
});

test('bbf20ce archive record binds exact two-file payload, manifest and branch source', () => {
  assert.deepEqual(record.archive.entries.map(entry => entry.path).sort(), ['INTEGRITY.json', 'index.html']);
  const html = record.archive.entries.find(entry => entry.path === 'index.html');
  const manifest = record.archive.entries.find(entry => entry.path === 'INTEGRITY.json');
  assert.equal(html.size_bytes, 60548);
  assert.equal(html.sha256, 'b0d328daecaacbea98d92d3c928909411da906d817ba0a58471af26ea52833bb');
  assert.equal(html.git_blob_sha1, 'b32d86ce81cc9374db2c7e46d7122ce47c2b1065');
  assert.equal(manifest.size_bytes, 862);
  assert.equal(manifest.sha256, '0b53253ae8a132c706a78b89f364c9b5c1bc9568ee4383805be379cc1006afc4');
  for (const key of [
    'artifact_metadata_matches_run',
    'archive_sha256_matches_github_metadata',
    'archive_sha256_matches_workflow_log',
    'downloaded_archive_size_matches_metadata',
    'zip_listing_exact',
    'zip_crc_and_decompression_test',
    'manifest_json_parsed',
    'html_sha256_matches_manifest',
    'html_git_blob_sha1_matches_manifest',
    'html_git_blob_sha1_matches_branch_source',
    'source_commit_matches_manifest',
    'workflow_commit_matches_manifest',
    'source_branch_matches_manifest'
  ]) assert.equal(record.checks[key], true, key);
  assert.equal(record.checks.target_subpath_matches, '/dadyar-preview/');
  assert.equal(record.checks.topic_hint_count, 27);
});

test('bbf20ce artifact evidence never authorizes API, public AI, restore or deployment', () => {
  assert.equal(record.checks.api_enabled, false);
  assert.equal(record.checks.public_ai_enabled, false);
  assert.equal(record.checks.reviewer_authentication, 'not-implemented');
  assert.equal(record.checks.backup_restore_verified, false);
  assert.equal(record.checks.destination_verified, false);
  assert.equal(record.checks.deployment_authorized, false);
  assert.match(record.verification_scope, /downloaded from GitHub Actions artifact/);
  assert.ok(record.limitations.some(value => /does not prove a real backup restore/.test(value)));
  assert.ok(record.limitations.some(value => /Do not upload/.test(value)));
});

test('bbf20ce review record contains only digest evidence, not backup bytes or credentials', () => {
  assert.match(record.archive.sha256, /^[a-f0-9]{64}$/);
  assert.match(record.source_commit, /^[a-f0-9]{40}$/);
  assert.ok(Number.isSafeInteger(record.archive.size_bytes) && record.archive.size_bytes > 0);
  for (const entry of record.archive.entries) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(entry.size_bytes) && entry.size_bytes > 0);
  }
  const serialized = JSON.stringify(record).toLowerCase();
  for (const forbidden of ['private_key', 'api_key', 'password', 'client_record', 'backup_archive_content']) {
    assert.equal(serialized.includes(forbidden), false, 'review record must not contain ' + forbidden);
  }
});
