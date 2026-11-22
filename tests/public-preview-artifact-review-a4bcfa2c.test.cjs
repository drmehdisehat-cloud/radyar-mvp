'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-a4bcfa2c-20261122.json'),
  'utf8'
));

test('downloaded public preview artifact is pinned to the exact successful push head', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.source.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source.commit, 'b7bc2767ddbf547f49314d7001ebb2668052389e');
  assert.equal(record.workflow.run_id, 45045319150);
  assert.equal(record.workflow.event, 'push');
  assert.equal(record.workflow.status, 'completed');
  assert.equal(record.workflow.conclusion, 'success');
  assert.equal(record.workflow.head_sha, record.source.commit);
  assert.equal(record.artifact.id, 14763495951);
  assert.equal(record.artifact.size_bytes, 18028);
  assert.equal(record.artifact.sha256, 'a4bcfa2c3ebfb585b6a62072cde31b8d2031826fd657ae6795cf3089c527190e');
});

test('artifact contains exactly the two reviewed public files with verified byte digests', () => {
  assert.deepEqual(record.artifact.archive_entries.map(entry => entry.path).sort(),
    ['INTEGRITY.json', 'index.html']);
  const html = record.artifact.archive_entries.find(entry => entry.path === 'index.html');
  const manifest = record.artifact.archive_entries.find(entry => entry.path === 'INTEGRITY.json');
  assert.equal(html.size_bytes, 60839);
  assert.equal(html.sha256, '4c754518e9b345a9be98c134d997a329bbe929105ed8b9c7210ef7636d5b1452');
  assert.equal(html.git_blob_sha1, 'a151444524a6ff439bba21ec29564e512c3a8472');
  assert.equal(manifest.size_bytes, 862);
  assert.equal(manifest.sha256, '792f7e8cfa59528cf9dfac11490ada48355d1a51a56b08bbd242e4683d71ee42');
  assert.equal(record.artifact.zip_crc_verified, true);
  assert.equal(record.checks.zip_listing_exact, true);
  assert.equal(record.checks.zip_crc_and_extraction, true);
  assert.equal(record.checks.html_sha256_matches_manifest, true);
  assert.equal(record.checks.html_git_blob_sha1_matches_branch_source, true);
});

test('integrity manifest pins the target path and keeps all live-release gates closed', () => {
  const m = record.integrity_manifest;
  assert.equal(m.source_commit, record.source.commit);
  assert.equal(m.workflow_commit, record.source.commit);
  assert.equal(m.source_branch, record.source.branch);
  assert.equal(m.target_subpath, '/dadyar-preview/');
  assert.equal(m.topic_hint_count, 27);
  assert.equal(m.api_enabled, false);
  assert.equal(m.public_ai_enabled, false);
  assert.equal(m.reviewer_authentication, 'not-implemented');
  assert.equal(m.backup_restore_verified, false);
  assert.equal(m.destination_verified, false);
  assert.equal(m.deployment_authorized, false);
});

test('artifact review evidence does not claim legal, reviewer, restore or deployment approval', () => {
  assert.equal(record.checks.network_primitives_absent_in_downloaded_html, true);
  assert.equal(record.checks.csp_connect_src_none, true);
  assert.match(record.verification_scope, /downloaded from GitHub Actions/);
  assert.ok(record.limitations.some(item => /does not prove a real backup restore/.test(item)));
  assert.ok(record.limitations.some(item => /local review acknowledgement is not reviewer authentication/.test(item)));
  assert.ok(record.limitations.some(item => /Do not upload/.test(item)));
  const serialized = JSON.stringify(record).toLowerCase();
  for (const forbidden of ['private_key', 'api_key', 'password', 'client_record', 'backup_archive_content']) {
    assert.equal(serialized.includes(forbidden), false, 'review record must not contain ' + forbidden);
  }
});
