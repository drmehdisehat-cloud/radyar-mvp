'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-14983108311-20261125.json'),
  'utf8'
));

test('binds the downloaded public preview artifact to the exact branch commit and successful CI jobs', () => {
  assert.equal(evidence.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(evidence.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(evidence.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(evidence.sourceCommit, '2830dbe6800172948d249e0fe5c175896824d4b9');
  assert.equal(evidence.requiredCi.runId, 45528094761);
  assert.deepEqual(evidence.requiredCi.jobs.map(job => job.conclusion), ['success', 'success']);
  assert.equal(evidence.requiredCi.contractTests.passed, 1458);
  assert.equal(evidence.requiredCi.contractTests.failed, 0);
  assert.equal(evidence.requiredCi.contractTests.skipped, 0);
  assert.equal(evidence.artifactWorkflow.runId, 45528094737);
  assert.equal(evidence.artifactWorkflow.jobConclusion, 'success');
  assert.equal(evidence.artifact.id, 14983108311);
  assert.equal(evidence.artifact.entryCount, 2);
});

test('locks the recomputed ZIP, HTML and integrity-manifest digests to the GitHub artifact', () => {
  assert.equal(evidence.artifact.sizeBytes, 19728);
  assert.equal(
    evidence.artifact.archiveSha256,
    '6b3013c1eca25369d41d9271f5df3ca4a8e2d5e6fca2ddc614f44a6066151e40'
  );
  const entries = Object.fromEntries(evidence.artifact.entries.map(entry => [entry.path, entry]));
  assert.deepEqual(Object.keys(entries).sort(), ['INTEGRITY.json', 'index.html']);
  assert.equal(entries['index.html'].sizeBytes, 65821);
  assert.equal(entries['index.html'].sha256, 'fb31fa29491d3e087d1700a8a053305f3fce555c28728b6ebe0fba7ef822b327');
  assert.equal(entries['index.html'].gitBlobSha1, '90f7616162591efb9c7f0b059105e09f12873e98');
  assert.equal(entries['INTEGRITY.json'].sizeBytes, 967);
  assert.equal(entries['INTEGRITY.json'].sha256, 'eee53a2b1628aacc6466faef4988099d9514f770a582c5826f1ea2b40fc40906');
  for (const field of [
    'downloadedFromGitHub',
    'zipListingVerified',
    'archiveSha256Recomputed',
    'htmlSha256Recomputed',
    'integrityManifestSha256Recomputed',
    'manifestMatchesArtifact',
    'htmlMatchesSourceGitBlob'
  ]) assert.equal(evidence.verification[field], true, field);
});

test("keeps the artifact's offline and synthetic scope separate from release authorization", () => {
  assert.equal(evidence.manifest.sourceCommit, evidence.sourceCommit);
  assert.equal(evidence.manifest.targetSubpath, '/dadyar-preview/');
  assert.equal(evidence.manifest.topicHintCount, 27);
  assert.equal(evidence.manifest.apiEnabled, false);
  assert.equal(evidence.manifest.publicAiEnabled, false);
  assert.equal(evidence.manifest.reviewerAuthentication, 'not-configured');
  assert.equal(evidence.manifest.backupRestoreVerified, false);
  assert.equal(evidence.manifest.destinationVerified, false);
  assert.equal(evidence.manifest.deploymentAuthorized, false);
  assert.equal(evidence.verification.productionHostRequested, false);
  assert.equal(evidence.verification.restorePerformed, false);
  assert.equal(evidence.verification.destinationTestPerformed, false);
  assert.equal(evidence.verification.reviewerIdentityVerified, false);
  assert.equal(evidence.verification.legalAccuracyVerified, false);
});

test('records the observed public repository posture without treating it as deployment approval', () => {
  assert.equal(evidence.releasePosture.status, 'NOT_READY');
  assert.equal(evidence.releasePosture.visibility, 'public');
  assert.equal(evidence.releasePosture.branchProtected, false);
  assert.ok(evidence.releasePosture.blockers.includes('backup_restore_unverified'));
  assert.ok(evidence.releasePosture.blockers.includes('destination_unverified'));
  assert.ok(evidence.releasePosture.blockers.includes('reviewer_authentication_not_configured'));
});

test('keeps artifact evidence free of credentials and client matter data', () => {
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /private[_ -]?key|api[_ -]?key|bearer\s+[a-z0-9._-]+|password|client[_ -]?name|case[_ -]?number/i);
  assert.equal(evidence.observedAt, '2026-11-25');
});
