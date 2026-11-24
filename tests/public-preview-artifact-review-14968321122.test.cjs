'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/public-preview-artifact-review-14968321122-20261125.json'),
  'utf8'
));

test('records the downloaded preview artifact against the exact branch head and workflow', () => {
  assert.equal(evidence.schema, 'dadyar-public-preview-artifact-review-v1');
  assert.equal(evidence.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(evidence.branch, 'dadyar/ai-chat-private-20261101');
  assert.match(evidence.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(evidence.sourceCommit, evidence.manifest.sourceCommit);
  assert.equal(evidence.sourceCommit, evidence.manifest.workflowCommit);
  assert.equal(evidence.observedAt, '2026-11-25');
  assert.equal(evidence.observationTimePrecision, 'date-only; exact download timestamp is not asserted');
  assert.equal(evidence.workflow.event, 'push');
  assert.equal(evidence.workflow.conclusion, 'success');
  assert.equal(evidence.artifact.id, 14968321122);
  assert.equal(evidence.workflow.runId, 45493582975);
  assert.equal(evidence.artifact.entryCount, 2);
});

test('locks the independently recomputed archive, HTML and manifest digests', () => {
  assert.equal(evidence.artifact.sizeBytes, 19727);
  assert.match(evidence.artifact.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    evidence.artifact.archiveSha256,
    '0ceb95fd84b3ea09d9eeaea97af42babfce3dbc26b95079becf80f707e55db43'
  );
  const entries = Object.fromEntries(evidence.artifact.entries.map(entry => [entry.path, entry]));
  assert.deepEqual(Object.keys(entries).sort(), ['INTEGRITY.json', 'index.html']);
  assert.equal(entries['index.html'].sizeBytes, 65821);
  assert.equal(entries['index.html'].sha256, evidence.manifest.sha256);
  assert.equal(entries['index.html'].gitBlobSha1, evidence.manifest.gitBlobSha1);
  assert.equal(entries['INTEGRITY.json'].sizeBytes, 967);
  assert.equal(
    entries['INTEGRITY.json'].sha256,
    'ac676e6e212e147e91dd726f75dfe37fccdb23259e15fe97660e49a2a90f5950'
  );
  assert.equal(evidence.verification.downloadedFromGitHub, true);
  assert.equal(evidence.verification.zipListingVerified, true);
  assert.equal(evidence.verification.archiveSha256Recomputed, true);
  assert.equal(evidence.verification.htmlSha256Recomputed, true);
  assert.equal(evidence.verification.integrityManifestSha256Recomputed, true);
  assert.equal(evidence.verification.manifestMatchesArtifact, true);
  assert.equal(evidence.verification.htmlMatchesSourceGitBlob, true);
});

test('keeps integrity review separate from identity, restore, destination and release approval', () => {
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
  assert.match(evidence.releaseBoundary, /Do not publish/i);
});

test('keeps the review record free of credentials and client matter data', () => {
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /private[_ -]?key|api[_ -]?key|bearer\s+[a-z0-9._-]+|password|client[_ -]?name|case[_ -]?number/i);
  assert.deepEqual(
    Object.keys(evidence).sort(),
    ['artifact', 'branch', 'manifest', 'observationTimePrecision', 'observedAt', 'releaseBoundary', 'repository', 'schema', 'sourceCommit', 'verification', 'workflow'].sort()
  );
});
