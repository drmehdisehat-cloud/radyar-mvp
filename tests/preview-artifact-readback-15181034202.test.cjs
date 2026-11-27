'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/preview-artifact-readback-15181034202-20261127.json'),
  'utf8'
));

test('latest preview readback binds exact commit, CI, and independently downloaded artifact bytes', () => {
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.branch, 'dadyar/preview-review-slice-20261126');
  assert.equal(record.sourceCommit, '677c4992395d2f09473cebbb1e6d846d301b822f');
  assert.equal(record.workflowCommit, record.sourceCommit);
  assert.equal(record.ci.pushRunId, 45962221388);
  assert.equal(record.ci.pushConclusion, 'success');
  assert.equal(record.ci.pullRequestRunId, 45962227162);
  assert.equal(record.ci.pullRequestConclusion, 'success');
  assert.deepEqual(record.ci.testCounts, {
    contractAndSecurity: 67,
    narrowChromium: 1,
    mobileAndHttp: 2,
    packagedArtifactMobileAndHttp: 2,
    total: 72,
    failed: 0,
    skipped: 0
  });
  assert.equal(record.ci.roundTripJob, 'roundtrip-verify');
  assert.equal(record.ci.roundTripConclusion, 'success');
  assert.equal(record.ci.roundTripStatus, 'UPLOADED_ARTIFACT_ROUND_TRIP_VERIFIED');

  assert.equal(record.artifact.id, 15181034202);
  assert.equal(record.artifact.zipBytes, 17569);
  assert.equal(record.artifact.zipSha256, '97f6c952aae1089b4aaf9fba660cbf94eecb2e556c7397eac89736d8ed6d82ff');
  assert.deepEqual(record.artifact.files, ['INTEGRITY.json', 'index.html']);
  assert.equal(record.artifact.integrityJsonBytes, 1150);
  assert.equal(record.artifact.integrityJsonSha256, '078d5249ad8ea1c6f5dc21d3c323d02bf018e72b7e764caf59440c5934952f68');
  assert.equal(record.artifact.htmlBytes, 57321);
  assert.equal(record.artifact.htmlSha256, '9f58e64a4b309ff8687655c369595f248f6d89349c1bf0fb96011e11b8286455');
  assert.equal(record.artifact.sourceGitBlobSha1, 'fe319c0d3ec9a4f2eb16cc5f7623a3f4339dfbfa');
  assert.equal(record.artifact.workflowGitBlobSha1, record.artifact.sourceGitBlobSha1);
  assert.equal(record.artifact.route, '/dadyar-preview/');
});

test('artifact readback is evidence only and never authorizes restore, destination, API, or release', () => {
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
