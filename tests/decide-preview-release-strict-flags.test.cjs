'use strict';
// Regression checks for fail-closed release decisions. Synthetic inputs are NOT
// evidence of real backup recovery, mobile verification or owner approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');
const sha = 'a'.repeat(64);
const valid = {
  restoreEvidence: { restore_proven: true },
  destinationEvidence: { matched: true, source_sha256: sha, destination_sha256: sha },
  isolatedRestoreVerified: true,
  mobileBrowserVerified: true,
  zeroApiRequestsVerified: true,
  humanReviewVerified: true
};
test('every release evidence flag must be literal boolean true', () => {
  for (const key of ['isolatedRestoreVerified', 'mobileBrowserVerified', 'zeroApiRequestsVerified', 'humanReviewVerified']) {
    for (const invalid of ['true', 1, {}, null, undefined]) {
      const result = decidePreviewRelease({ ...valid, [key]: invalid });
      assert.equal(result.status, 'NOT_READY', key + ': ' + String(invalid));
      assert.ok(result.blockers.length > 0);
    }
  }
});
test('destination cannot be accepted with missing, malformed or nonmatching hashes', () => {
  for (const bad of ['', 'a'.repeat(63), 'g'.repeat(64), null]) {
    const result = decidePreviewRelease({ ...valid, destinationEvidence: { matched: true, source_sha256: bad, destination_sha256: bad } });
    assert.equal(result.status, 'NOT_READY');
    assert.ok(result.blockers.includes('deployed destination integrity not proven'));
  }
});
test('synthetic restore checker output cannot authorize deployment', () => {
  const result = decidePreviewRelease({ ...valid, restoreEvidence: { restore_proven: false, evidence: 'archive-integrity-and-restored-file-only' } });
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.blockers.includes('independent restore not proven'));
});
