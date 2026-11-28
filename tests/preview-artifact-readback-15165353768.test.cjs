'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/preview-artifact-readback-15165353768-20261127.json'),
  'utf8'
));

test('current preview artifact readback binds exact source, push CI and round-trip artifact', () => {
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.branch, 'dadyar/preview-review-slice-20261126');
  assert.equal(record.sourceCommit, '8d81e7386a75bcab77d323f36a9d9db2eb5d92d1');
  assert.equal(record.workflowCommit, record.sourceCommit);
  assert.equal(record.ci.pushRunId, 45923772579);
  assert.equal(record.ci.pushConclusion, 'success');
  assert.equal(record.ci.pullRequestRunId, 45923778493);
  assert.equal(record.ci.pullRequestConclusion, 'success');
  assert.deepEqual(record.ci.testCounts, {
    contractAndSecurity: 60,
    narrowChromium: 1,
    mobileAndHttp: 2,
    total: 63,
    failed: 0,
    skipped: 0
  });
  assert.equal(record.ci.roundTripJob, 'roundtrip-verify');
  assert.equal(record.ci.roundTripConclusion, 'success');
  assert.equal(record.ci.roundTripStatus, 'UPLOADED_ARTIFACT_ROUND_TRIP_VERIFIED');
  assert.equal(record.ci.pullRequestArtifactBuild, 'skipped-by-event-guard');

  assert.equal(record.artifact.id, 15165353768);
  assert.equal(record.artifact.zipBytes, 17569);
  assert.equal(record.artifact.zipSha256, '63d74e56b41dfdd54bdb175b74c3a77bbb43ebbdc49290f926fc4f7b47a75d7f');
  assert.deepEqual(record.artifact.files, ['INTEGRITY.json', 'index.html']);
  assert.equal(record.artifact.integrityJsonBytes, 1150);
  assert.equal(record.artifact.integrityJsonSha256, '97f2b57ce3abc29f93bc74ea0aa2f39d56faeb921ea6b87fce6d1090d520230d');
  assert.equal(record.artifact.htmlBytes, 57321);
  assert.equal(record.artifact.htmlSha256, '9f58e64a4b309ff8687655c369595f248f6d89349c1bf0fb96011e11b8286455');
  assert.equal(record.artifact.sourceGitBlobSha1, record.artifact.workflowGitBlobSha1);
  assert.equal(record.artifact.route, '/dadyar-preview/');
});

test('artifact readback remains evidence only and cannot authorize restore or release', () => {
  assert.equal(record.release.status, 'NOT_READY');
  assert.equal(record.release.backupRestoreVerified, false);
  assert.equal(record.release.destinationVerified, false);
  assert.equal(record.release.reviewerIdentityConfigured, false);
  assert.equal(record.release.deploymentAuthorized, false);
  assert.equal(record.release.apiEnabled, false);
  assert.equal(record.release.publicAiEnabled, false);
  assert.ok(record.limitations.some(item => /real backup restore/i.test(item)));
  assert.ok(record.limitations.some(item => /hosting destination/i.test(item)));
  assert.ok(record.limitations.some(item => /does not authenticate reviewer identity/i.test(item)));
});
