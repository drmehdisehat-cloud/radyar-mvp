'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-14942519198-20261124.json'),
  'utf8'
));
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function gitBlobSha1(bytes) {
  return crypto.createHash('sha1')
    .update(Buffer.concat([Buffer.from('blob ' + bytes.length + '\\0'), bytes]))
    .digest('hex');
}

test('downloaded public preview artifact is bound to the exact source commit and bytes', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.source.branch, 'dadyar/ai-chat-private-20261101');
  assert.match(record.source.commit, /^[a-f0-9]{40}$/);
  const sourceBytes = execFileSync('git', [
    'show', record.source.commit + ':' + record.source.path
  ]);
  assert.equal(sha256(sourceBytes), record.source.sha256);
  assert.equal(gitBlobSha1(sourceBytes), record.source.git_blob_sha1);

  assert.equal(record.workflow.required_ci_conclusion, 'success');
  assert.equal(record.workflow.contract_tests.passed, 1427);
  assert.equal(record.workflow.contract_tests.failed, 0);
  assert.equal(record.workflow.contract_tests.skipped, 0);
  assert.equal(record.workflow.artifact_job_conclusion, 'success');

  const artifact = record.artifact;
  assert.equal(artifact.github_digest_sha256, artifact.downloaded_zip_sha256);
  assert.equal(artifact.size_bytes, 19728);
  assert.deepEqual(
    artifact.files.map(file => file.path).sort(),
    ['INTEGRITY.json', 'index.html']
  );
  const html = artifact.files.find(file => file.path === 'index.html');
  const manifest = artifact.files.find(file => file.path === 'INTEGRITY.json');
  assert.equal(html.sha256, record.source.sha256);
  assert.equal(html.git_blob_sha1, record.source.git_blob_sha1);
  assert.equal(manifest.sha256, 'a286d6385307117eff34cfea7a381d0c282c43be1a5e5c20812dc5208dfd8701');
  assert.equal(artifact.manifest.source_commit, record.source.commit);
  assert.equal(artifact.manifest.target_subpath, '/dadyar-preview/');
});

test('artifact review evidence cannot be promoted into deployment authorization', () => {
  assert.equal(record.verification.downloaded, true);
  assert.equal(record.verification.zip_integrity_test, 'passed');
  assert.equal(record.verification.github_digest_matches_downloaded_zip, true);
  assert.equal(record.verification.html_sha256_matches_manifest, true);
  assert.equal(record.verification.html_git_blob_matches_source_commit, true);
  assert.equal(record.release_boundary.api_enabled, false);
  assert.equal(record.release_boundary.public_ai_enabled, false);
  assert.equal(record.release_boundary.reviewer_authentication, 'not-configured');
  assert.equal(record.release_boundary.backup_restore_verified, false);
  assert.equal(record.release_boundary.destination_verified, false);
  assert.equal(record.release_boundary.deployment_authorized, false);
  assert.ok(record.verification.not_proven.includes('backup restoration'));
  assert.ok(record.verification.not_proven.includes('live HTTPS destination'));
});
