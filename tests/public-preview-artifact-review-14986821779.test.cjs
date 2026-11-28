'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-14986821779-20261125.json'),
  'utf8'
));

test('binds the downloaded public preview artifact to the exact branch commit and successful CI jobs', () => {
  assert.equal(evidence.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(evidence.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(evidence.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(evidence.sourceCommit, '08eb0afb622320d2842ae292b077560bc5574b71');
  assert.equal(evidence.requiredCi.runId, 45534787124);
  assert.deepEqual(evidence.requiredCi.jobs.map(job => job.conclusion), ['success', 'success']);
  assert.equal(evidence.requiredCi.contractTests.passed, 1463);
  assert.equal(evidence.requiredCi.contractTests.failed, 0);
  assert.equal(evidence.requiredCi.contractTests.skipped, 0);
  assert.equal(evidence.artifactWorkflow.runId, 45534787168);
  assert.equal(evidence.artifactWorkflow.jobConclusion, 'success');
  assert.equal(evidence.artifact.id, 14986821779);
  assert.equal(evidence.artifact.entryCount, 2);
});

test('locks the recomputed ZIP, HTML, integrity-manifest and Git blob digests', () => {
  assert.equal(evidence.artifact.sizeBytes, 19726);
  assert.equal(
    evidence.artifact.archiveSha256,
    '87e6eaa8c0e565420630564dbefe59e953b9d7f5bd836e771d93367ab1f23529'
  );
  const entries = Object.fromEntries(evidence.artifact.entries.map(entry => [entry.path, entry]));
  assert.deepEqual(Object.keys(entries).sort(), ['INTEGRITY.json', 'index.html']);
  assert.equal(entries['index.html'].sizeBytes, 65821);
  assert.equal(entries['index.html'].sha256, 'fb31fa29491d3e087d1700a8a053305f3fce555c28728b6ebe0fba7ef822b327');
  assert.equal(entries['index.html'].gitBlobSha1, '90f7616162591efb9c7f0b059105e09f12873e98');
  assert.equal(entries['INTEGRITY.json'].sizeBytes, 967);
  assert.equal(entries['INTEGRITY.json'].sha256, 'bf979b2474e7b4665ac96fea1d5b5191aee043cd2128cf183037f4a1cd38d8c1');
  for (const field of [
    'downloadedFromGitHub',
    'zipListingVerified',
    'archiveSha256Recomputed',
    'htmlSha256Recomputed',
    'integrityManifestSha256Recomputed',
    'manifestMatchesArtifact',
    'htmlMatchesSourceGitBlob',
    'sourceGitBlobMatchesBranchFile'
  ]) assert.equal(evidence.verification[field], true, field);
});

test('preserves the offline-only preview and refuses to promote local review into authenticated release approval', () => {
  assert.equal(evidence.manifest.sourceCommit, evidence.sourceCommit);
  assert.equal(evidence.manifest.targetSubpath, '/dadyar-preview/');
  assert.equal(evidence.manifest.topicHintCount, 27);
  assert.equal(evidence.manifest.apiEnabled, false);
  assert.equal(evidence.manifest.publicAiEnabled, false);
  assert.equal(evidence.manifest.reviewerAuthentication, 'not-configured');
  assert.equal(evidence.manifest.backupRestoreVerified, false);
  assert.equal(evidence.manifest.destinationVerified, false);
  assert.equal(evidence.manifest.deploymentAuthorized, false);
  assert.equal(evidence.verification.restorePerformed, false);
  assert.equal(evidence.verification.destinationTestPerformed, false);
  assert.equal(evidence.verification.reviewerIdentityVerified, false);
  assert.equal(evidence.verification.legalAccuracyVerified, false);
});

test('records repository privacy and branch-protection blockers without treating CI success as release approval', () => {
  assert.equal(evidence.releasePosture.status, 'NOT_READY');
  assert.equal(evidence.releasePosture.visibility, 'public');
  assert.equal(evidence.releasePosture.branchProtected, false);
  for (const blocker of [
    'repository_must_be_private',
    'release_branch_protection_disabled',
    'backup_restore_unverified',
    'destination_unverified',
    'reviewer_authentication_not_configured'
  ]) assert.ok(evidence.releasePosture.blockers.includes(blocker), blocker);
});

test('keeps artifact evidence free of credentials and real client matter data', () => {
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /private[_ -]?key|api[_ -]?key|bearer\s+[a-z0-9._-]+|password|client[_ -]?name|case[_ -]?number/i);
  assert.equal(evidence.observedAt, '2026-11-25');
});
