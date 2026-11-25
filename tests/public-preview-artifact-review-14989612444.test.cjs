'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-14989612444-20261125.json'),
  'utf8'
));

test('binds the current preview artifact to the exact branch head and completed CI', () => {
  assert.equal(evidence.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(evidence.sourceCommit, '29907ca51a04f9991db53d6d5f5c0d54aac29dfa');
  assert.equal(evidence.requiredCi.runId, 45542107758);
  assert.deepEqual(evidence.requiredCi.jobs.map(job => job.conclusion), ['success', 'success']);
  assert.deepEqual(evidence.requiredCi.contractTests, { passed: 1468, failed: 0, skipped: 0 });
  assert.equal(evidence.artifactWorkflow.runId, 45542107878);
  assert.equal(evidence.artifactWorkflow.jobConclusion, 'success');
  assert.equal(evidence.historicalAnchor.workflowRunId, 42206234440);
  assert.equal(evidence.historicalAnchor.workflowConclusion, 'success');
});

test('locks the independently downloaded ZIP and both exact archive entries', () => {
  assert.equal(evidence.artifact.id, 14989612444);
  assert.equal(evidence.artifact.sizeBytes, 19727);
  assert.equal(evidence.artifact.archiveSha256, 'd036f8f962c1499041b0ce97177c4b338f292ba716f163164b794b7e23a24690');
  assert.equal(evidence.artifact.entryCount, 2);
  const entries = Object.fromEntries(evidence.artifact.entries.map(entry => [entry.path, entry]));
  assert.deepEqual(Object.keys(entries).sort(), ['INTEGRITY.json', 'index.html']);
  assert.equal(entries['index.html'].sizeBytes, 65821);
  assert.equal(entries['index.html'].sha256, 'fb31fa29491d3e087d1700a8a053305f3fce555c28728b6ebe0fba7ef822b327');
  assert.equal(entries['index.html'].gitBlobSha1, '90f7616162591efb9c7f0b059105e09f12873e98');
  assert.equal(entries['INTEGRITY.json'].sizeBytes, 967);
  assert.equal(entries['INTEGRITY.json'].sha256, '26d3d2eafd640ea3ac10ef208383dad62d689a5557cc0fe9e532a9e6777e32cd');
});

test('keeps the artifact tied to the offline 27-topic preview and disables network AI', () => {
  assert.equal(evidence.manifest.sourceCommit, evidence.sourceCommit);
  assert.equal(evidence.manifest.targetSubpath, '/dadyar-preview/');
  assert.equal(evidence.manifest.topicHintCount, 27);
  assert.equal(evidence.manifest.apiEnabled, false);
  assert.equal(evidence.manifest.publicAiEnabled, false);
  assert.equal(evidence.verification.productionHostRequested, false);
  assert.equal(evidence.verification.restorePerformed, false);
  assert.equal(evidence.verification.destinationTestPerformed, false);
});

test('does not promote local review, backup, destination or legal evidence into release authorization', () => {
  assert.equal(evidence.manifest.reviewerAuthentication, 'not-configured');
  assert.equal(evidence.manifest.backupRestoreVerified, false);
  assert.equal(evidence.manifest.destinationVerified, false);
  assert.equal(evidence.manifest.deploymentAuthorized, false);
  assert.equal(evidence.verification.reviewerIdentityVerified, false);
  assert.equal(evidence.verification.legalAccuracyVerified, false);
  assert.equal(evidence.repositoryPosture.status, 'NOT_READY');
  assert.deepEqual(evidence.repositoryPosture.auditBlockers, [
    'repository_must_be_private',
    'release_branch_protection_disabled'
  ]);
});

test('records current PR review state and keeps all release PRs in draft', () => {
  assert.deepEqual(evidence.pullRequests.map(pr => pr.number), [8, 9, 16, 17]);
  assert.ok(evidence.pullRequests.every(pr => pr.state === 'open' && pr.draft === true));
  assert.ok(evidence.pullRequests.every(pr => pr.submittedReviews === 0));
});

test('keeps the evidence record free of client data and credential material', () => {
  const serialized = JSON.stringify(evidence);
  const forbiddenCredentialPattern = /-----BEGIN|bearer\s+[a-z0-9._-]+|client[_ -]?name|case[_ -]?number/i;
  assert.doesNotMatch(serialized, forbiddenCredentialPattern);
});

test('credential audit pattern detects a conventional Bearer authorization header', () => {
  const forbiddenCredentialPattern = /-----BEGIN|bearer\s+[a-z0-9._-]+|client[_ -]?name|case[_ -]?number/i;
  assert.equal(forbiddenCredentialPattern.test('Authorization: Bearer synthetic-token-123'), true);
  assert.equal(forbiddenCredentialPattern.test('ordinary preview review note'), false);
});
