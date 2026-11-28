'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const record = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../docs/public-preview-artifact-review-851af228-20261123.json'), 'utf8'
));
const source = execFileSync('git', ['show', record.sourceCommit + ':dadyar-preview/index.html']);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function gitBlobSha1(bytes) {
  const hash = crypto.createHash('sha1');
  hash.update(Buffer.from('blob ' + bytes.length + '\0', 'ascii'));
  hash.update(bytes);
  return hash.digest('hex');
}

test('downloaded preview artifact is pinned to the exact source and successful CI runs', () => {
  assert.equal(record.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(record.sourceCommit, '851af228bed4b78310b0c31d7977d5162dab7e18');
  assert.equal(record.workflow.artifactRun.conclusion, 'success');
  assert.equal(record.workflow.contractAndBrowserRun.conclusion, 'success');
  assert.equal(record.artifact.id, 14776222595);
  assert.equal(record.manifest.sourceCommit, record.sourceCommit);
  assert.equal(record.manifest.workflowCommit, record.sourceCommit);
});

test('artifact HTML hashes match the checked-in preview source byte for byte', () => {
  const html = record.artifact.entries.find(entry => entry.path === 'index.html');
  assert.ok(html);
  assert.equal(html.sizeBytes, source.length);
  assert.equal(html.sha256, sha256(source));
  assert.equal(html.gitBlobSha1, gitBlobSha1(source));
  assert.equal(record.manifest.sha256, undefined);
  assert.equal(record.manifest.topicHintCount, 27);
});

test('artifact archive and integrity manifest evidence has valid immutable digests', () => {
  assert.equal(record.artifact.downloaded, true);
  assert.equal(record.artifact.zipIntegrity, 'passed');
  assert.equal(record.artifact.sizeBytes, 18027);
  assert.match(record.artifact.archiveSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(record.artifact.entries.map(entry => entry.path).sort(), ['INTEGRITY.json', 'index.html']);
  const manifest = record.artifact.entries.find(entry => entry.path === 'INTEGRITY.json');
  assert.equal(manifest.sizeBytes, 862);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
});

test('CI evidence records zero failures across contract, Chromium and mobile suites', () => {
  assert.equal(record.workflow.contractTests.passed, 1274);
  assert.equal(record.workflow.contractTests.failed, 0);
  assert.equal(record.workflow.contractTests.skipped, 0);
  assert.equal(record.workflow.browserTests.reduce((n, item) => n + item.passed, 0), 18);
  assert.ok(record.workflow.browserTests.every(item => item.failed === 0));
  assert.equal(record.checks.chromiumAndMobileSuitesPassed, 18);
});

test('artifact remains offline and cannot satisfy hosting, reviewer or deployment gates', () => {
  assert.equal(record.manifest.targetSubpath, '/dadyar-preview/');
  assert.equal(record.manifest.apiEnabled, false);
  assert.equal(record.manifest.publicAiEnabled, false);
  assert.equal(record.manifest.reviewerAuthentication, 'not-implemented');
  assert.equal(record.manifest.backupRestoreVerified, false);
  assert.equal(record.manifest.destinationVerified, false);
  assert.equal(record.manifest.deploymentAuthorized, false);
  assert.equal(record.checks.liveSiteHttpVerified, false);
  assert.equal(record.checks.hostingBackupRestoreProven, false);
  assert.equal(record.checks.hostingDestinationCanonicalPathVerified, false);
  assert.equal(record.decision, 'REVIEW_ONLY_NOT_DEPLOYABLE');
});
