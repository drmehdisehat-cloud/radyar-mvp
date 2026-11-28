'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const observation = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/branch-observation-20261125-pre-change.json'),
  'utf8'
));

const SHA1 = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;

test('pre-change branch observation is pinned to the exact experimental head and main base', () => {
  assert.equal(observation.schema, 'dadyar-branch-observation-v1');
  assert.equal(observation.branch, 'dadyar/ai-chat-private-20261101');
  assert.ok(SHA1.test(observation.sourceCommit));
  assert.equal(observation.sourceCommit, 'e033f644cdda3672242b8557f53d84f9264656da');
  assert.equal(observation.comparison.baseCommit, 'd3f02e3b0d4cd3f5d40aabc63bd5d3d93d792318');
  assert.equal(observation.comparison.aheadBy, 1851);
  assert.equal(observation.comparison.behindBy, 0);
});

test('historical cheque fix and workflow evidence remain bound to the same commit', () => {
  const anchor = observation.historicalAnchor;
  assert.equal(anchor.correctionCommit, '4d4f7530c47f438a1d89e18afef246cec026391f');
  assert.equal(anchor.workflowRunId, 42206234440);
  assert.equal(anchor.workflowConclusion, 'success');
  assert.equal(anchor.workflowHeadSha, anchor.correctionCommit);
  assert.equal(anchor.allListedStepsSucceeded, true);
});

test('PR CI evidence records source SHA separately from synthetic merge SHAs', () => {
  const ci = observation.exactHeadCi;
  assert.equal(ci.sourceCommit, observation.sourceCommit);
  assert.equal(ci.pushCiOnExactHeadVerified, false);
  assert.deepEqual(ci.associatedPullRequestRuns.map(run => run.runId), [
    45616440649, 45616441070, 45616440617
  ]);
  for (const run of ci.associatedPullRequestRuns) {
    assert.equal(run.sourceCommit, observation.sourceCommit);
    assert.ok(SHA1.test(run.workflowCommit));
    assert.notEqual(run.workflowCommit, run.sourceCommit);
    assert.equal(run.event, 'pull_request');
    assert.equal(run.conclusion, 'success');
    assert.deepEqual(run.contractTests, { passed: 1505, failed: 0, skipped: 0 });
    assert.deepEqual(run.browserTests, { passed: 19, failed: 0, skipped: 0 });
    assert.equal(run.releasePostureJob, 'skipped');
  }
});

test('an older verified artifact cannot be presented as the current branch build', () => {
  const artifact = observation.previousArtifact;
  assert.equal(artifact.artifactId, 15010460344);
  assert.ok(SHA1.test(artifact.sourceCommit));
  assert.notEqual(artifact.sourceCommit, observation.sourceCommit);
  assert.equal(artifact.artifactCurrentAtCapture, true);
  assert.equal(artifact.staleForObservedHead, true);
  assert.equal(artifact.mustNotBePresentedAsCurrentBuild, true);
  assert.ok(SHA256.test(artifact.archiveSha256));
  assert.ok(SHA256.test(artifact.htmlSha256));
  assert.ok(SHA256.test(artifact.manifestSha256));
});

test('repository posture is fail-closed when privacy or branch protection is missing', () => {
  assert.equal(observation.repositoryPosture.visibility, 'public');
  assert.equal(observation.repositoryPosture.branchProtected, false);
  assert.equal(observation.repositoryPosture.branchProtectionReadAtThisRun, false);
  assert.deepEqual(observation.repositoryPosture.blockers, [
    'repository_must_be_private',
    'release_branch_protection_disabled'
  ]);
  assert.equal(observation.release.status, 'NOT_READY');
  assert.equal(observation.release.deploymentAuthorized, false);
});

test('restore, reviewer identity and legal-source observations never become release proof by metadata alone', () => {
  assert.equal(observation.restore.backupRestoreVerified, false);
  assert.equal(observation.restore.destinationVerified, false);
  assert.equal(observation.restore.independentRestoreManifestAvailable, false);
  assert.equal(observation.preview.reviewerAuthentication, 'not-configured');
  assert.equal(observation.preview.localReviewOnly, true);
  assert.equal(observation.legalSources.chequeAmendment1372.primarySourceVerified, false);
  assert.equal(observation.legalSources.chequeAmendment1372.legalAnswerUsePermitted, false);
  assert.equal(observation.legalSources.regulation1403.textPageResult, 'timeout');
  assert.equal(observation.legalSources.uniformOpinion850.humanReviewStatus, 'pending');
  assert.equal(observation.release.legalAccuracyVerified, false);
  assert.equal(observation.release.deploymentAuthorized, false);
});
