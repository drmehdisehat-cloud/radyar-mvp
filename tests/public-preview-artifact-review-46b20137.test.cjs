'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../docs/public-preview-artifact-review-46b20137-20261123.json'), 'utf8'
));

test('current-head preview artifact review is pinned to the exact branch commit and successful workflow', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.sourceCommit, '46b201375401470c08439999666a8aaec504e4b9');
  assert.equal(record.workflow.conclusion, 'success');
  assert.equal(record.workflow.id, 45074151835);
  assert.equal(record.artifact.id, 14775025780);
  assert.equal(record.manifest.sourceCommit, record.sourceCommit);
  assert.equal(record.manifest.workflowCommit, record.sourceCommit);
});

test('reviewed ZIP has exactly the public HTML and integrity manifest with pinned hashes', () => {
  assert.equal(record.artifact.downloaded, true);
  assert.equal(record.artifact.zipIntegrity, 'passed');
  assert.equal(record.artifact.sizeBytes, 18026);
  assert.equal(record.artifact.entries.length, 2);
  assert.deepEqual(record.artifact.entries.map(x => x.path).sort(), ['INTEGRITY.json', 'index.html']);
  assert.match(record.artifact.archiveSha256, /^[a-f0-9]{64}$/);
  for (const entry of record.artifact.entries) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(entry.sizeBytes) && entry.sizeBytes > 0);
  }
  assert.equal(record.artifact.entries.find(x => x.path === 'index.html').gitBlobSha1,
    'a151444524a6ff439bba21ec29564e512c3a8472');
});

test('artifact remains offline and all external release gates remain closed', () => {
  assert.equal(record.manifest.targetSubpath, '/dadyar-preview/');
  assert.equal(record.manifest.topicHintCount, 27);
  assert.equal(record.manifest.apiEnabled, false);
  assert.equal(record.manifest.publicAiEnabled, false);
  assert.equal(record.manifest.reviewerAuthentication, 'not-implemented');
  assert.equal(record.manifest.backupRestoreVerified, false);
  assert.equal(record.manifest.destinationVerified, false);
  assert.equal(record.manifest.deploymentAuthorized, false);
  assert.equal(record.checks.liveSiteHttpVerified, false);
  assert.equal(record.checks.backupRestoreProven, false);
  assert.equal(record.checks.destinationCanonicalPathVerified, false);
  assert.equal(record.decision, 'REVIEW_ONLY_NOT_DEPLOYABLE');
});

test('artifact evidence does not promote legal or reviewer approval', () => {
  assert.equal(record.manifest.reviewerAuthentication, 'not-implemented');
  assert.match(record.note, /not evidence of hosting backup restoration/);
  assert.match(record.note, /legal-source approval/);
});
