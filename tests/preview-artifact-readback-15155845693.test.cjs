'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/preview-artifact-readback-15155845693-20261127.json'),
  'utf8'
));

test('latest preview readback record binds the exact source, CI and uploaded artifact', () => {
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.repository, 'drmehdisehat-cloud/radyar-mvp');
  assert.equal(record.branch, 'dadyar/preview-review-slice-20261126');
  assert.equal(record.sourceCommit, 'a5f654bc4905908607bf62a799fdc7e957715bea');
  assert.equal(record.workflowCommit, record.sourceCommit);
  assert.equal(record.ci.pushConclusion, 'success');
  assert.equal(record.ci.pullRequestConclusion, 'success');
  assert.deepEqual(record.ci.testCounts, {
    contractAndSecurity: 56,
    narrowChromium: 1,
    mobileAndHttp: 2,
    total: 59,
    failed: 0,
    skipped: 0
  });
  assert.equal(record.ci.roundTripConclusion, 'success');
  assert.equal(record.ci.roundTripStatus, 'UPLOADED_ARTIFACT_ROUND_TRIP_VERIFIED');
  assert.equal(record.artifact.id, 15155845693);
  assert.equal(record.artifact.zipBytes, 17418);
  assert.equal(record.artifact.zipSha256, '79add46fea90c4f3dda1e131263994f76993de791ccaac4ef129696345a0c139');
  assert.deepEqual(record.artifact.files, ['INTEGRITY.json', 'index.html']);
  assert.equal(record.artifact.htmlSha256, '7042f7ef8a533445573d4c5d05110fadfc4f2d6718ca3e61739af0ad280c1da5');
  assert.equal(record.artifact.sourceGitBlobSha1, record.artifact.workflowGitBlobSha1);
  assert.equal(record.artifact.route, '/dadyar-preview/');
});

test('artifact readback record cannot be interpreted as restore or release approval', () => {
  assert.equal(record.release.status, 'NOT_READY');
  assert.equal(record.release.backupRestoreVerified, false);
  assert.equal(record.release.destinationVerified, false);
  assert.equal(record.release.reviewerIdentityConfigured, false);
  assert.equal(record.release.deploymentAuthorized, false);
  assert.equal(record.release.apiEnabled, false);
  assert.equal(record.release.publicAiEnabled, false);
  assert.ok(record.limitations.some(item => /real backup restore/i.test(item)));
  assert.ok(record.limitations.some(item => /hosting destination/i.test(item)));
  assert.ok(record.limitations.some(item => /does not authenticate reviewer/i.test(item)));
});
