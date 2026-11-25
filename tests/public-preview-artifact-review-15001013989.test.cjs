'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-15001013989-20261125.json'),
  'utf8'
));

test('pins the downloaded preview artifact to the exact source commit and successful CI', () => {
  assert.equal(evidence.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(evidence.sourceCommit, '40512ff9e840700711612f789f718da0c4afd37a');
  assert.equal(evidence.requiredCi.runId, 45570090977);
  assert.deepEqual(evidence.requiredCi.jobs.map(job => job.conclusion), ['success', 'success']);
  assert.deepEqual(evidence.requiredCi.contractTests, { passed: 1488, failed: 0, skipped: 0 });
  assert.deepEqual(evidence.requiredCi.browser.total, { passed: 19, failed: 0, skipped: 0 });
  assert.equal(evidence.artifactWorkflow.runId, 45570091011);
  assert.equal(evidence.artifactWorkflow.jobConclusion, 'success');
  assert.equal(evidence.historicalAnchor.workflowRunId, 42206234440);
  assert.equal(evidence.historicalAnchor.workflowConclusion, 'success');
});

test('locks the independently downloaded ZIP and both exact archive entries', () => {
  assert.equal(evidence.artifact.id, 15001013989);
  assert.equal(evidence.artifact.sizeBytes, 19728);
  assert.equal(evidence.artifact.archiveSha256, 'ac4f331ac7ea511dffd708fcc0a8773df149149d47e0db1d64b4418a92695c37');
  assert.equal(evidence.artifact.entryCount, 2);
  const entries = Object.fromEntries(evidence.artifact.entries.map(entry => [entry.path, entry]));
  assert.deepEqual(Object.keys(entries).sort(), ['INTEGRITY.json', 'index.html']);
  assert.equal(entries['index.html'].sizeBytes, 65821);
  assert.equal(entries['index.html'].sha256, 'fb31fa29491d3e087d1700a8a053305f3fce555c28728b6ebe0fba7ef822b327');
  assert.equal(entries['index.html'].gitBlobSha1, '90f7616162591efb9c7f0b059105e09f12873e98');
  assert.equal(entries['INTEGRITY.json'].sizeBytes, 967);
  assert.equal(entries['INTEGRITY.json'].sha256, 'e52b4a0c90eef7861eee5642a9a1d41de1a296dc7250d12ba589705bd7b2a62b');
});

test('keeps the artifact offline, Persian, multi-topic and non-authorizing', () => {
  assert.equal(evidence.manifest.sourceCommit, evidence.sourceCommit);
  assert.equal(evidence.manifest.targetSubpath, '/dadyar-preview/');
  assert.equal(evidence.manifest.topicHintCount, 27);
  assert.equal(evidence.manifest.apiEnabled, false);
  assert.equal(evidence.manifest.publicAiEnabled, false);
  assert.equal(evidence.verification.networkApiPrimitivesAbsent, true);
  assert.equal(evidence.manifest.reviewerAuthentication, 'not-configured');
  assert.equal(evidence.manifest.backupRestoreVerified, false);
  assert.equal(evidence.manifest.destinationVerified, false);
  assert.equal(evidence.manifest.deploymentAuthorized, false);
});

test('preserves the live GitHub release blockers and unreviewed Draft PR state', () => {
  assert.equal(evidence.repositoryPosture.status, 'NOT_READY');
  assert.equal(evidence.repositoryPosture.visibility, 'public');
  assert.equal(evidence.repositoryPosture.branchProtected, false);
  assert.deepEqual(evidence.repositoryPosture.auditBlockers, [
    'repository_must_be_private',
    'release_branch_protection_disabled'
  ]);
  assert.deepEqual(evidence.pullRequests.map(pr => pr.number), [8, 16, 17]);
  assert.ok(evidence.pullRequests.every(pr => pr.state === 'open' && pr.draft && pr.submittedReviews === 0));
});

test('marks this artifact stale after any later source commit', () => {
  const currentHead = process.env.DADYAR_PREVIEW_SOURCE_SHA ||
    process.env.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.match(currentHead, /^[a-f0-9]{40}$/);
  if (evidence.sourceCommit !== currentHead) {
    const limitations = evidence.limitations.join(' ');
    assert.ok(limitations.includes(evidence.sourceCommit));
    assert.match(limitations, /not a package for any later source commit/i);
  }
});

test('keeps the evidence record free of client data and credential material', () => {
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /-----BEGIN|bearer\s+[a-z0-9._-]+|client[_ -]?name|case[_ -]?number/i);
});
