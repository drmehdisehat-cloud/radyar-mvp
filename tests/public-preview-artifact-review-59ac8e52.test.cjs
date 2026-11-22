'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-59ac8e52-20261122.json'),
  'utf8'
));

test('review evidence is pinned to the exact successful push artifact and source commit', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.source.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.workflow.event, 'push');
  assert.equal(record.workflow.status, 'completed');
  assert.equal(record.workflow.conclusion, 'success');
  assert.equal(record.workflow.head_sha, record.source.commit);
  assert.equal(record.artifact.id, 14767851731);
  assert.equal(record.artifact.size_bytes, 18027);
  assert.equal(record.artifact.sha256, '59ac8e52449c924350778bfb49f2777714b8fe97265266613913531ed1a77590');
});

test('reviewed HTML bytes still match the exact branch source', () => {
  const source = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'));
  const sha256 = crypto.createHash('sha256').update(source).digest('hex');
  const gitBlob = crypto.createHash('sha1')
    .update(Buffer.from('blob ' + source.length + '\0'))
    .update(source)
    .digest('hex');
  assert.equal(source.length, record.source.bytes);
  assert.equal(sha256, record.source.sha256);
  assert.equal(gitBlob, record.source.git_blob_sha1);
});

test('downloaded ZIP contains exactly the two reviewed public files with matching digests', () => {
  assert.deepEqual(record.artifact.archive_entries.map(entry => entry.path).sort(),
    ['INTEGRITY.json', 'index.html']);
  const html = record.artifact.archive_entries.find(entry => entry.path === 'index.html');
  const manifest = record.artifact.archive_entries.find(entry => entry.path === 'INTEGRITY.json');
  assert.equal(html.size_bytes, 60839);
  assert.equal(html.sha256, record.source.sha256);
  assert.equal(html.git_blob_sha1, record.source.git_blob_sha1);
  assert.equal(manifest.size_bytes, 862);
  assert.equal(manifest.sha256, 'b33fb51038dddb62d5ea48afc96bdfbce5d30b77378e127e8f41a0bc82bf989b');
  assert.equal(record.artifact.zip_crc_verified, true);
  assert.equal(record.checks.zip_listing_exact, true);
  assert.equal(record.checks.zip_crc_and_extraction, true);
  assert.equal(record.checks.html_sha256_matches_manifest, true);
  assert.equal(record.checks.html_git_blob_sha1_matches_branch_source, true);
});

test('manifest preserves exact target and every live-release gate remains closed', () => {
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
});

test('review evidence records independent download scope without claiming deployment approval', () => {
  assert.equal(record.checks.artifact_sha256_matches_github_digest, true);
  assert.equal(record.checks.network_primitives_absent_in_downloaded_html, true);
  assert.equal(record.checks.csp_connect_src_none, true);
  assert.match(record.verification_scope, /downloaded from GitHub Actions artifact/);
  assert.ok(record.limitations.some(item => /does not prove a real backup restore/.test(item)));
  assert.ok(record.limitations.some(item => /local review acknowledgement is not reviewer authentication/.test(item)));
  assert.ok(record.limitations.some(item => /Do not upload/.test(item)));
  const serialized = JSON.stringify(record).toLowerCase();
  for (const forbidden of ['private_key', 'api_key', 'password', 'client_record', 'backup_archive_content']) {
    assert.equal(serialized.includes(forbidden), false, 'review record must not contain ' + forbidden);
  }
});
