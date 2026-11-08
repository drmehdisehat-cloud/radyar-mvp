'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const baseline = {
  restoreEvidence: { restore_proven: true },
  isolatedRestoreVerified: true,
  destinationEvidence: { matched: true, source_sha256: 'b'.repeat(64), destination_sha256: 'b'.repeat(64) },
  mobileBrowserVerified: true,
  zeroApiRequestsVerified: true,
  humanReviewVerified: true
};
test('empty deployment artifact cannot count as verified destination', () => {
  for (const hash of [EMPTY, EMPTY.toUpperCase()]) {
    const result = decidePreviewRelease({
      ...baseline,
      destinationEvidence: { matched: true, source_sha256: hash, destination_sha256: hash }
    });
    assert.equal(result.status, 'NOT_READY');
    assert.ok(result.blockers.includes('deployed destination integrity not proven'));
  }
});
test('nonempty-shaped synthetic evidence never authorizes automatic deployment', () => {
  assert.equal(decidePreviewRelease(baseline).status, 'READY_FOR_OWNER_DEPLOYMENT_APPROVAL');
});
