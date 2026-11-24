'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const recordPath = path.join(
  __dirname,
  '../docs/public-preview-artifact-review-d3dcd2d9-20261123.json'
);
const recordBytes = fs.readFileSync(recordPath);
const record = JSON.parse(recordBytes.toString('utf8'));

test('downloaded review artifact is pinned to its exact source commit and successful workflows', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.source.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(record.source.commit, 'de0f4f0ab81d097ef46c5eba0c93c2aa5f426bfa');
  assert.equal(record.source.repository_path, 'dadyar-preview/index.html');
  assert.equal(record.ci.push_run_id, 45079671377);
  assert.equal(record.ci.push_conclusion, 'success');
  assert.equal(record.ci.artifact_run_id, 45079671340);
  assert.equal(record.ci.artifact_conclusion, 'success');
  assert.equal(record.artifact.id, 14776961466);
  assert.equal(record.artifact.name, 'dadyar-public-preview-review-de0f4f0ab81d097ef46c5eba0c93c2aa5f426bfa');
});

test('downloaded ZIP and its two public files retain exact byte digests', () => {
  assert.equal(record.artifact.downloaded_bytes, 18026);
  assert.match(record.artifact.downloaded_zip_sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    record.artifact.downloaded_zip_sha256,
    'd3dcd2d9582d7962283b61a50b18cdda93cd902d310e87db726d061601b02ab4'
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
  assert.equal(manifest.sha256, 'a31a9b0513f67f52302f781228b729e607a8ae0628932c9c7710f25a56f291a0');
  assert.equal(record.artifact.integrity_manifest.source_commit, record.source.commit);
  assert.equal(record.artifact.integrity_manifest.workflow_commit, record.source.commit);
  assert.equal(record.artifact.integrity_manifest.target_subpath, '/dadyar-preview/');
});

test('artifact evidence never promotes local review, legal research or ZIP integrity to release approval', () => {
  assert.equal(record.verification.local_review_required_before_report_download, true);
  assert.equal(record.verification.local_review_is_not_authentication, true);
  assert.equal(record.verification.browser_external_requests_observed, 0);
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
  assert.match(record.limitations.join(' '), /does not prove a real backup restore/);
  assert.match(record.limitations.join(' '), /does not authenticate the reviewer/);
  assert.doesNotMatch(recordBytes.toString('utf8'), /sk-[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{12,}/);
});
