'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-14750841502-20261122.json'),
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

test('review record is pinned to the exact source commit and downloadable artifact', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.source.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source.commit, 'bf37f5ef3fc38a0bda2285a394295f9abf6eadee');
  assert.equal(record.workflow.id, 45013514916);
  assert.equal(record.workflow.conclusion, 'success');
  assert.equal(record.artifact.id, 14750841502);
  assert.equal(record.artifact.size_bytes, 17976);
  assert.equal(record.artifact.sha256, 'af81d5881aa62aec4de43a351625e16276904fdeced2bf07c677bb4230af0106');
  assert.deepEqual(record.artifact.archive_entries, ['index.html', 'INTEGRITY.json']);
  assert.equal(record.artifact.zip_crc_verified, true);
});

test('artifact HTML hashes still match the checked-out source bytes', () => {
  assert.equal(html.length, record.source.bytes);
  assert.equal(sha256(html), record.source.sha256);
  assert.equal(gitBlobSha1(html), record.source.git_blob_sha1);
  assert.equal(record.integrity_manifest.sha256, '29a710a25c441b98322ead6ed9532cdb75cc61bdf75a017547758699f33e5173');
});

test('artifact remains an offline 27-domain review preview, not a public AI release', () => {
  assert.equal(record.integrity_manifest.target_subpath, '/dadyar-preview/');
  assert.equal(record.integrity_manifest.topic_hint_count, 27);
  assert.equal(record.integrity_manifest.api_enabled, false);
  assert.equal(record.integrity_manifest.public_ai_enabled, false);
  assert.equal(record.integrity_manifest.reviewer_authentication, 'not-implemented');
  assert.match(html.toString('utf8'), /default-src 'none'/);
  assert.match(html.toString('utf8'), /connect-src 'none'/);
  assert.match(html.toString('utf8'), /form-action 'none'/);
  assert.match(html.toString('utf8'), /id="download" disabled/);
  assert.doesNotMatch(html.toString('utf8'), /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/);
});

test('artifact evidence never upgrades restore, destination or deployment gates', () => {
  assert.equal(record.integrity_manifest.backup_restore_verified, false);
  assert.equal(record.integrity_manifest.destination_verified, false);
  assert.equal(record.integrity_manifest.deployment_authorized, false);
  assert.ok(record.limitations.some(item => /does not prove backup restoration/i.test(item)));
  assert.ok(record.limitations.some(item => /does not verify the hosting destination/i.test(item)));
});
