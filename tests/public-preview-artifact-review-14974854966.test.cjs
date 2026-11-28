'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-14974854966-20261125.json'),
  'utf8'
));

test('binds the downloaded artifact to the current experimental branch head and successful workflow', () => {
  assert.equal(evidence.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(evidence.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(evidence.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(evidence.sourceCommit, 'c513f91333d89e14b24c1aee853fe1264e6789ee');
  assert.equal(evidence.workflow.event, 'push');
  assert.equal(evidence.workflow.conclusion, 'success');
  assert.equal(evidence.workflow.runId, 45512137352);
  assert.equal(evidence.workflow.jobId, 138862269961);
  assert.equal(evidence.artifact.id, 14974854966);
  assert.equal(evidence.artifact.entryCount, 2);
});

test('locks the recomputed ZIP and both extracted entry digests', () => {
  assert.equal(evidence.artifact.sizeBytes, 19727);
  assert.equal(
    evidence.artifact.archiveSha256,
    '15d8fa85ac4ada8b5f2c1da9a8b7714da3d97be9669ef21de1667def167f7b30'
  );
  const entries = Object.fromEntries(evidence.artifact.entries.map(entry => [entry.path, entry]));
  assert.deepEqual(Object.keys(entries).sort(), ['INTEGRITY.json', 'index.html']);
  assert.equal(entries['index.html'].sizeBytes, 65821);
  assert.equal(entries['index.html'].sha256, 'fb31fa29491d3e087d1700a8a053305f3fce555c28728b6ebe0fba7ef822b327');
  assert.equal(entries['index.html'].gitBlobSha1, '90f7616162591efb9c7f0b059105e09f12873e98');
  assert.equal(entries['INTEGRITY.json'].sizeBytes, 967);
  assert.equal(entries['INTEGRITY.json'].sha256, '941e0274c911b74ee130c535a07f9811b5c4f5ed9d0fb97974ee8d3a7baed8e3');
  for (const field of [
    'downloadedFromGitHub',
    'zipListingVerified',
    'archiveSha256Recomputed',
    'htmlSha256Recomputed',
    'integrityManifestSha256Recomputed',
    'manifestMatchesArtifact',
    'htmlMatchesRepositorySourceGitBlob'
  ]) assert.equal(evidence.verification[field], true, field);
});

test('keeps the free-question preview offline and every production release gate closed', () => {
  assert.equal(evidence.repositorySourcePath, 'dadyar-preview/index.html');
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
});

test('keeps artifact evidence free of credentials and real client matter data', () => {
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /private[_ -]?key|api[_ -]?key|bearer\s+[a-z0-9._-]+|password|client[_ -]?name|case[_ -]?number/i);
  assert.equal(evidence.observationTimePrecision, 'date-only; archive digests were recomputed after download');
});
