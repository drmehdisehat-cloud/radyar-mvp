'use strict';
// Integration regression: an offline checkbox/name must never satisfy the
// authenticated reviewer gate, and the prototype report handler stays unmounted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');

const root = path.resolve(__dirname, '..');
const preview = fs.readFileSync(path.join(root, 'dadyar-preview/index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');

test('offline preview identifies its reviewer entry as local and unauthenticated', () => {
  const sectionStart = preview.indexOf('<section id="human-review"');
  const downloadStart = preview.indexOf('<button type="button" id="download"', sectionStart);
  assert.ok(sectionStart >= 0 && downloadStart > sectionStart, 'human-review section missing');
  const section = preview.slice(sectionStart, downloadStart);
  assert.match(section, /بازبینی محلی توسط انسان \\(بدون احراز هویت\\)/);
  assert.match(section, /هویت یا سمت بازبین احراز نمی‌شود/);
  assert.match(section, /ثبت اظهار محلی بازبین/);
  const downloadHandler = preview.slice(preview.indexOf("document.getElementById('download').addEventListener"));
  assert.match(downloadHandler, /اظهار محلی؛ هویت احراز نشده/);
  assert.match(downloadHandler, /تأیید حقوقی یا احراز هویت محسوب نمی‌شود/);
});

test('local human-review acknowledgement cannot satisfy authenticated release gates', () => {
  const decision = decidePreviewRelease({
    restoreEvidence: { restore_proven: false },
    destinationEvidence: null,
    isolatedRestoreVerified: true,
    mobileBrowserVerified: true,
    zeroApiRequestsVerified: true,
    localHumanReviewAcknowledged: true,
    authenticatedHumanReviewAttested: false,
    authenticatedRestoreAttestation: true,
    trustedReviewerAuthenticationAdapterVerified: false
  });

  assert.equal(decision.status, 'NOT_READY');
  assert.ok(decision.blockers.includes('authenticated human reviewer attestation missing'));
  assert.ok(decision.blockers.includes('trusted reviewer authentication adapter is not integrated and verified'));
  assert.equal(decision.deploymentAuthorized, false);
});

test('signed-review report HTTP prototype remains disconnected from the development server', () => {
  assert.doesNotMatch(server, /signed-review-release-http|review-release-http-handler/);
  assert.doesNotMatch(server, /createSignedReviewReleaseHttpServer/);
  assert.doesNotMatch(server, /\/api\/dadyar\/review-report/);
});
