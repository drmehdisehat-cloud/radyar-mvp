'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-14754920919-20261122.json'),
  'utf8'
));
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'));

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function gitBlobSha1(bytes) {
  return crypto.createHash('sha1')
    .update('blob ' + bytes.length + String.fromCharCode(0))
    .update(bytes)
    .digest('hex');
}

test('downloaded artifact is pinned to the exact successful push head', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.source.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source.commit, '66facd392cdbbe3547407d7c04da482825aaa319');
  assert.equal(record.workflow.id, 45023353128);
  assert.equal(record.workflow.event, 'push');
  assert.equal(record.workflow.conclusion, 'success');
  assert.equal(record.artifact.id, 14754920919);
  assert.equal(record.artifact.size_bytes, 17977);
  assert.equal(record.artifact.sha256, 'a2ac8f25f8663fc8c74eabc9c0c6ae8bf414bc945fa5bf3eed9393fdb76bcab9');
  assert.deepEqual(record.artifact.archive_entries, ['index.html', 'INTEGRITY.json']);
  assert.equal(record.artifact.zip_crc_verified, true);
});

test('bundled HTML bytes still match the downloaded artifact and Git source', () => {
  assert.equal(html.length, record.source.bytes);
  assert.equal(sha256(html), record.source.sha256);
  assert.equal(gitBlobSha1(html), record.source.git_blob_sha1);
  assert.equal(record.integrity_manifest.source_commit, record.source.commit);
  assert.equal(record.integrity_manifest.workflow_commit, record.source.commit);
  assert.equal(record.integrity_manifest.sha256, '0ea2c9d9562608964d55cacc3ff07afab2c6a3579a9c3e7f3bc5fc9fb352fdbf');
});

test('preview is a mobile-capable offline 27-domain review page, not public AI', () => {
  const source = html.toString('utf8');
  assert.equal(record.integrity_manifest.target_subpath, '/dadyar-preview/');
  assert.equal(record.integrity_manifest.topic_hint_count, 27);
  assert.equal(record.integrity_manifest.api_enabled, false);
  assert.equal(record.integrity_manifest.public_ai_enabled, false);
  assert.equal(record.integrity_manifest.reviewer_authentication, 'not-implemented');
  assert.match(source, /name="viewport"/);
  assert.match(source, /default-src 'none'/);
  assert.match(source, /connect-src 'none'/);
  assert.match(source, /form-action 'none'/);
  assert.match(source, /id="download" disabled/);
  assert.doesNotMatch(source, /\\b(?:fetch\\s*\\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\\b/);
});

test('artifact evidence cannot promote restore, destination or deployment gates', () => {
  assert.equal(record.integrity_manifest.backup_restore_verified, false);
  assert.equal(record.integrity_manifest.destination_verified, false);
  assert.equal(record.integrity_manifest.deployment_authorized, false);
  assert.ok(record.limitations.some(item => /does not prove backup restoration/i.test(item)));
  assert.ok(record.limitations.some(item => /does not verify the hosting destination/i.test(item)));
});
