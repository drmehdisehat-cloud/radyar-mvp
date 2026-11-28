'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-15010460344-20261125.json'),
  'utf8'
));

test('pins the current-at-capture artifact to exact source, historical correction and successful exact-head CI', () => {
  assert.equal(evidence.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(evidence.sourceCommit, 'eb321c9c146ea3e429567da7abe1242d038a9905');
  assert.equal(evidence.main.sha, 'd3f02e3b0d4cd3f5d40aabc63bd5d3d93d792318');
  assert.equal(evidence.main.aheadBy, 1843);
  assert.equal(evidence.main.behindBy, 0);
  assert.equal(evidence.commitSignature.verified, false);
  assert.equal(evidence.historicalAnchor.correctionCommit, '4d4f7530c47f438a1d89e18afef246cec026391f');
  assert.equal(evidence.historicalAnchor.workflowRunId, 42206234440);
  assert.equal(evidence.historicalAnchor.workflowConclusion, 'success');
  assert.equal(evidence.requiredCi.runId, 45588159109);
  assert.deepEqual(evidence.requiredCi.jobs.map(job => job.conclusion), ['success', 'success']);
  assert.deepEqual(evidence.requiredCi.contractTests, { passed: 1497, failed: 0, skipped: 0 });
  assert.deepEqual(evidence.requiredCi.browser.total, { passed: 19, failed: 0, skipped: 0 });
  assert.deepEqual(evidence.requiredCi.pullRequestRuns.map(run => run.conclusion), ['success', 'success', 'success']);
  assert.ok(evidence.requiredCi.pullRequestRuns.every(run => run.headSha === evidence.sourceCommit));
});

test('locks the independently downloaded ZIP, exact entries and source Git blob', () => {
  assert.equal(evidence.artifact.id, 15010460344);
  assert.equal(evidence.artifact.sizeBytes, 19727);
  assert.equal(evidence.artifact.archiveSha256, '75fbbc89729cebf61fb7ee029117a5055333dfec11607817a4d11b72a8480477');
  assert.equal(evidence.artifact.entryCount, 2);
  const entries = Object.fromEntries(evidence.artifact.entries.map(entry => [entry.path, entry]));
  assert.deepEqual(Object.keys(entries).sort(), ['INTEGRITY.json', 'index.html']);
  assert.equal(entries['index.html'].sizeBytes, 65821);
  assert.equal(entries['index.html'].sha256, 'fb31fa29491d3e087d1700a8a053305f3fce555c28728b6ebe0fba7ef822b327');
  assert.equal(entries['index.html'].gitBlobSha1, '90f7616162591efb9c7f0b059105e09f12873e98');
  assert.equal(entries['INTEGRITY.json'].sizeBytes, 967);
  assert.equal(entries['INTEGRITY.json'].sha256, 'd66c4a22e3a5c6288d97820eae1b681a64dbee869b4c4a7f2f1669a6d0f73d3e');
  assert.equal(evidence.verification.downloadedFromGitHub, true);
  assert.equal(evidence.verification.archiveSha256Recomputed, true);
  assert.equal(evidence.verification.htmlMatchesSourceGitBlob, true);
});

test('keeps the artifact offline, multi-topic, mobile-tested and non-authorizing', () => {
  assert.equal(evidence.manifest.sourceCommit, evidence.sourceCommit);
  assert.equal(evidence.manifest.targetSubpath, '/dadyar-preview/');
  assert.equal(evidence.manifest.topicHintCount, 27);
  assert.equal(evidence.manifest.apiEnabled, false);
  assert.equal(evidence.manifest.publicAiEnabled, false);
  assert.equal(evidence.verification.networkApiPrimitivesAbsent, true);
  assert.equal(evidence.verification.cspConnectSrcNone, true);
  assert.deepEqual(evidence.verification.remoteRequests, []);
  assert.equal(evidence.verification.mobileDeviceEmulation.horizontalOverflow, false);
  assert.equal(evidence.verification.compactMobileViewport.horizontalOverflow, false);
  assert.equal(evidence.verification.rejectedHumanReviewKeepsExportBlocked, true);
  assert.equal(evidence.verification.approvedLocalReviewEnablesOneShotExport, true);
  assert.equal(evidence.verification.rawFreeQuestionExcludedFromReport, true);
  assert.equal(evidence.manifest.reviewerAuthentication, 'not-configured');
  assert.equal(evidence.manifest.backupRestoreVerified, false);
  assert.equal(evidence.manifest.destinationVerified, false);
  assert.equal(evidence.manifest.deploymentAuthorized, false);
});

test('preserves live repository blockers and the unreviewed security PR queue', () => {
  assert.equal(evidence.repositoryPosture.status, 'NOT_READY');
  assert.equal(evidence.repositoryPosture.visibility, 'public');
  assert.equal(evidence.repositoryPosture.branchProtected, false);
  assert.deepEqual(evidence.repositoryPosture.auditBlockers, [
    'repository_must_be_private',
    'release_branch_protection_disabled'
  ]);
  assert.deepEqual(evidence.pullRequests.map(pr => pr.number), [8, 16, 17, 21, 30, 32]);
  assert.ok(evidence.pullRequests.every(pr => pr.state === 'open' && pr.draft && pr.submittedReviews === 0));
  assert.ok(evidence.pullRequests.slice(3).every(pr => pr.ciConclusion === 'success'));
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
  assert.doesNotMatch(serialized, /-----BEGIN|bearer\\s+[a-z0-9._-]+|client[_ -]?name|case[_ -]?number/i);
  for (const forbidden of ['private_key', 'api_key', 'password', 'backup_archive_content']) {
    assert.equal(serialized.toLowerCase().includes(forbidden), false);
  }
});
