'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const record = require('../docs/public-preview-artifact-review-14948527869-20261124.json');

test('78199a1c public preview artifact record is bound to the exact source and successful CI', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.source.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source.commit, '78199a1c050e89222d7028b6f6da56d2fe9cf3cd');
  assert.equal(record.workflow.required_ci_conclusion, 'success');
  assert.equal(record.workflow.contract_tests.passed, 1429);
  assert.equal(record.workflow.contract_tests.failed, 0);
  assert.equal(record.workflow.contract_tests.skipped, 0);
  assert.equal(record.workflow.browser_tests.total.passed, 19);
  assert.equal(record.workflow.browser_tests.total.failed, 0);
  assert.equal(record.workflow.browser_tests.total.skipped, 0);
  assert.equal(record.workflow.artifact_run_id, 45451475600);
});

test('downloaded artifact metadata and bytes have matching SHA-256 and exact public file set', () => {
  assert.equal(record.artifact.id, 14948527869);
  assert.equal(record.artifact.size_bytes, 19725);
  assert.equal(record.artifact.github_digest_sha256, record.artifact.downloaded_zip_sha256);
  assert.equal(record.verification.downloaded, true);
  assert.equal(record.verification.zip_integrity_test, 'passed');
  assert.deepEqual(record.verification.exact_root_file_set, ['INTEGRITY.json', 'index.html']);
  assert.equal(record.verification.github_digest_matches_downloaded_zip, true);
  assert.equal(record.verification.html_sha256_matches_manifest, true);
  assert.equal(record.verification.html_git_blob_matches_source_commit, true);
});

test('artifact record never promotes offline review evidence into release authorization', () => {
  const manifest = record.artifact.manifest;
  assert.equal(manifest.target_subpath, '/dadyar-preview/');
  assert.equal(manifest.source_commit, record.source.commit);
  assert.equal(manifest.api_enabled, false);
  assert.equal(manifest.public_ai_enabled, false);
  assert.equal(manifest.reviewer_authentication, 'not-configured');
  assert.equal(manifest.backup_restore_verified, false);
  assert.equal(manifest.destination_verified, false);
  assert.equal(manifest.deployment_authorized, false);
  assert.equal(record.release_boundary.production_changes_made, false);
});

test('live host, restore, reviewer identity and legal accuracy remain explicitly unproven', () => {
  for (const item of [
    'live HTTPS destination',
    'destination filesystem identity',
    'backup restoration',
    'reviewer identity',
    'legal accuracy',
    'deployment authorization'
  ]) {
    assert.ok(record.verification.not_proven.includes(item), item);
  }
  assert.equal(record.repository_posture.status, 'NOT_READY');
  assert.equal(record.repository_posture.visibility, 'public');
  assert.equal(record.repository_posture.branch_protected, false);
  assert.deepEqual(record.repository_posture.blockers, [
    'repository_must_be_private',
    'release_branch_protection_disabled'
  ]);
});

test('historical cheque export checkpoint remains pinned to its original successful run', () => {
  assert.equal(record.historical_reference.commit, '4d4f7530c47f438a1d89e18afef246cec026391f');
  assert.equal(record.historical_reference.workflow_run_id, 42206234440);
  assert.equal(record.historical_reference.workflow_conclusion, 'success');
});
