'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-14976036285-20261125.json'),
  'utf8'
));

test('binds the downloaded preview artifact to the exact branch commit and successful workflow', () => {
  assert.equal(evidence.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(evidence.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(evidence.branch, 'dadyar/ai-chat-private-20261101');
  assert.equal(evidence.sourceCommit, '0c3421ea16bc91aa3dbabd6d92362c069c82218a');
  assert.equal(evidence.workflow.event, 'push');
  assert.equal(evidence.workflow.conclusion, 'success');
  assert.equal(evidence.workflow.runId, 45511884606);
  assert.equal(evidence.artifact.id, 14976036285);
  assert.equal(evidence.artifact.entryCount, 2);
});

test('locks the recomputed archive and extracted payload digests to the GitHub artifact', () => {
  assert.equal(evidence.artifact.sizeBytes, 19726);
  assert.equal(
    evidence.artifact.archiveSha256,
    '9b762166a709d474d2416041fb28bc971ccf39e84995667cc657af7631d9cfd1'
  );
  const entries = Object.fromEntries(evidence.artifact.entries.map(entry => [entry.path, entry]));
  assert.deepEqual(Object.keys(entries).sort(), ['INTEGRITY.json', 'index.html']);
  assert.equal(entries['index.html'].sizeBytes, 65821);
  assert.equal(entries['index.html'].sha256, 'fb31fa29491d3e087d1700a8a053305f3fce555c28728b6ebe0fba7ef822b327');
  assert.equal(entries['index.html'].gitBlobSha1, '90f7616162591efb9c7f0b059105e09f12873e98');
  assert.equal(entries['INTEGRITY.json'].sizeBytes, 967);
  assert.equal(entries['INTEGRITY.json'].sha256, 'd6faa87c1da41afa579a66616302614a8ed423d4793c7f4cfcff06d1eb35b18c');
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

test('keeps artifact integrity separate from reviewer identity, restore, destination and release authorization', () => {
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

test('keeps the artifact evidence free of credentials and client matter data', () => {
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /private[_ -]?key|api[_ -]?key|bearer\s+[a-z0-9._-]+|password|client[_ -]?name|case[_ -]?number/i);
  assert.equal(evidence.observationTimePrecision, 'date-only; exact download timestamp is not asserted');
});
