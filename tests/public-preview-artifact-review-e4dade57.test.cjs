'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const recordPath = path.join(
  __dirname,
  '../docs/public-preview-artifact-review-e4dade57-20261123.json'
);
const recordBytes = fs.readFileSync(recordPath);
const record = JSON.parse(recordBytes.toString('utf8'));

test('latest preview artifact is pinned to the exact reviewed source commit and successful CI', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.source.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source.commit, '472d84805633630b0fb4a58ce3dc8c05a0bf74f4');
  assert.equal(record.source.repository_path, 'dadyar-preview/index.html');
  assert.equal(record.ci.push_run_id, 45090607444);
  assert.equal(record.ci.push_conclusion, 'success');
  assert.equal(record.ci.artifact_run_id, 45090607392);
  assert.equal(record.ci.artifact_conclusion, 'success');
  assert.deepEqual(record.ci.pr_runs.map(run => run.conclusion), ['success', 'success', 'success']);
  assert.equal(record.ci.contract_tests.passed, 1285);
  assert.equal(record.ci.contract_tests.failed, 0);
  assert.equal(record.ci.contract_tests.skipped, 0);
  assert.equal(record.ci.browser_tests.passed, 19);
  assert.equal(record.ci.browser_tests.failed, 0);
  assert.equal(record.ci.browser_tests.skipped, 0);
});

test('downloaded archive and exact public files retain their independently checked digests', () => {
  assert.equal(record.artifact.id, 14781341805);
  assert.equal(record.artifact.workflow_run_id, 45090607392);
  assert.equal(record.artifact.downloaded_bytes, 18028);
  assert.equal(
    record.artifact.downloaded_zip_sha256,
    'e4dade577a55d841c2f252b5699a94b9600bb6cd959feffb6c26a53bcaded3b9'
  );
  assert.equal(record.artifact.zip_crc_verified, true);
  assert.deepEqual(
    record.artifact.entries.map(entry => entry.path).sort(),
    ['INTEGRITY.json', 'index.html']
  );
  const html = record.artifact.entries.find(entry => entry.path === 'index.html');
  const manifest = record.artifact.entries.find(entry => entry.path === 'INTEGRITY.json');
  assert.equal(html.bytes, 60839);
  assert.equal(html.sha256, record.source.sha256);
  assert.equal(html.git_blob_sha1, record.source.git_blob_sha1);
  assert.equal(manifest.bytes, 862);
  assert.equal(manifest.sha256, 'a601a650ad284c69a21043d7c6c81a51b640609e1752e3fa8fbac18a08b47e8a');
  assert.equal(record.artifact.integrity_manifest.source_commit, record.source.commit);
  assert.equal(record.artifact.integrity_manifest.workflow_commit, record.source.commit);
  assert.equal(record.artifact.integrity_manifest.target_subpath, '/dadyar-preview/');
  assert.equal(record.artifact.integrity_manifest.topic_hint_count, 27);
});

test('mobile and offline evidence is not promoted to authenticated review or release authorization', () => {
  assert.equal(record.verification.downloaded_from_artifact_id, record.artifact.id);
  assert.equal(record.verification.artifact_api_digest_matches_downloaded_zip, true);
  assert.equal(record.verification.zip_crc_and_extraction, true);
  assert.equal(record.verification.html_sha256_matches_manifest, true);
  assert.equal(record.verification.html_git_blob_matches_manifest, true);
  assert.equal(record.verification.local_review_required_before_report_download, true);
  assert.equal(record.verification.local_review_is_not_authentication, true);
  assert.equal(record.verification.browser_external_requests_observed, 0);
  assert.equal(record.verification.browser_api_requests_observed, 0);
  assert.equal(record.verification.unexpected_same_origin_requests_observed, 0);
  assert.equal(record.release_gates.backup_restore_verified, false);
  assert.equal(record.release_gates.destination_verified, false);
  assert.equal(record.release_gates.reviewer_authentication, 'not-implemented');
  assert.equal(record.release_gates.repository_private, false);
  assert.equal(record.release_gates.branch_protection_enabled, false);
  assert.equal(record.release_gates.legal_sources_approved, 0);
  assert.equal(record.release_gates.human_legal_reviews_approved, 0);
  assert.equal(record.release_gates.deployment_authorized, false);
  assert.equal(record.release_gates.api_enabled, false);
  assert.equal(record.release_gates.public_ai_enabled, false);
  assert.equal(record.repository_posture.experimental_branch_protected, false);
  assert.equal(record.repository_posture.main_branch_protected, false);
  assert.equal(record.repository_posture.historical_fix_run_conclusion, 'success');
  assert.match(record.limitations.join(' '), /does not authenticate the reviewer/);
  assert.match(record.limitations.join(' '), /does not prove a real backup restore/);
  assert.match(record.limitations.join(' '), /does not prove that cPanel or SolidCP serves the live URL/);
  assert.doesNotMatch(
    recordBytes.toString('utf8'),
    /sk-[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|Bearer\\s+[A-Za-z0-9._-]{12,}/
  );
});
