'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-08a46a17-20261123.json'),
  'utf8'
));

function gitBlobSha1(bytes) {
  return crypto.createHash('sha1')
    .update(Buffer.from('blob ' + bytes.length + '\0'))
    .update(bytes)
    .digest('hex');
}

test('latest downloaded preview artifact is pinned to its exact successful push run and source commit', () => {
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.source.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source.commit, 'd430447202b9daa0aee9cc77b3271fdd02284108');
  assert.equal(record.workflow.run_id, 45062734752);
  assert.equal(record.workflow.job_id, 137333493604);
  assert.equal(record.workflow.event, 'push');
  assert.equal(record.workflow.status, 'completed');
  assert.equal(record.workflow.conclusion, 'success');
  assert.equal(record.workflow.head_sha, record.source.commit);
  assert.equal(record.artifact.id, 14770033022);
  assert.equal(record.artifact.size_bytes, 18026);
  assert.equal(record.artifact.sha256, '08a46a174a2e16007ace28b910172db36d3574f4db78b17e58845f0a66f62686');
});

test('downloaded source HTML matches the exact branch bytes and Git blob', () => {
  const source = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'));
  const sha256 = crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(source.length, record.source.bytes);
  assert.equal(sha256, record.source.sha256);
  assert.equal(gitBlobSha1(source), record.source.git_blob_sha1);
  assert.equal(sha256, record.integrity_manifest.sha256);
  assert.equal(gitBlobSha1(source), record.integrity_manifest.git_blob_sha1);
});

test('downloaded ZIP evidence records exactly the two public files and their byte digests', () => {
  assert.deepEqual(record.artifact.archive_entries.map(x => x.path).sort(), ['INTEGRITY.json', 'index.html']);
  const html = record.artifact.archive_entries.find(x => x.path === 'index.html');
  const manifest = record.artifact.archive_entries.find(x => x.path === 'INTEGRITY.json');
  assert.equal(html.size_bytes, 60839);
  assert.equal(html.sha256, record.source.sha256);
  assert.equal(html.git_blob_sha1, record.source.git_blob_sha1);
  assert.equal(manifest.size_bytes, 862);
  assert.equal(manifest.sha256, '473e53c392d539bb245daf4c562ed094dddcbc49b529f37aabe5785a85db4b74');
  assert.equal(manifest.git_blob_sha1, '1160606ccae09e9182e63d2410db57841acc20c2');
  assert.equal(record.artifact.zip_crc_verified, true);
  assert.equal(record.checks.zip_listing_exact, true);
  assert.equal(record.checks.zip_crc_and_extraction, true);
});

test('the preview stays offline and all production-release gates remain closed', () => {
  const m = record.integrity_manifest;
  assert.equal(m.source_commit, record.source.commit);
  assert.equal(m.workflow_commit, record.source.commit);
  assert.equal(m.target_subpath, '/dadyar-preview/');
  assert.equal(m.topic_hint_count, 27);
  assert.equal(m.api_enabled, false);
  assert.equal(m.public_ai_enabled, false);
  assert.equal(m.reviewer_authentication, 'not-implemented');
  assert.equal(m.backup_restore_verified, false);
  assert.equal(m.destination_verified, false);
  assert.equal(m.deployment_authorized, false);
  assert.equal(record.checks.network_primitives_absent_in_downloaded_html, true);
  assert.equal(record.checks.csp_connect_src_none, true);
  assert.equal(record.checks.zero_api_calls_browser_test_passed, true);
});

test('test counts and limitations do not overstate what the artifact proves', () => {
  assert.equal(record.checks.contract_tests_passed, 1260);
  assert.equal(record.checks.browser_tests_passed, 19);
  assert.equal(record.checks.browser_tests_failed, 0);
  assert.equal(record.checks.browser_tests_skipped, 0);
  assert.match(record.verification_scope, /downloaded from GitHub Actions artifact 14770033022/);
  assert.ok(record.limitations.some(x => /does not prove a real backup restore/.test(x)));
  assert.ok(record.limitations.some(x => /local review acknowledgement is not reviewer authentication/.test(x)));
  assert.ok(record.limitations.some(x => /not a package for any later source commit/.test(x)));
  const serialized = JSON.stringify(record).toLowerCase();
  for (const forbidden of ['private_key', 'api_key', 'password', 'client_record', 'backup_archive_content']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
