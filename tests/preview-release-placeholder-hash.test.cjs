'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');

const base = {
  restoreEvidence: { restore_proven: true },
  isolatedRestoreVerified: true,
  destinationEvidence: { matched: true, source_sha256: 'a'.repeat(64), destination_sha256: 'a'.repeat(64) },
  mobileBrowserVerified: true,
  zeroApiRequestsVerified: true,
  humanReviewVerified: true
};

test('preview gate rejects placeholder all-zero SHA-256 even when matched flag is true', () => {
  const placeholder = '0'.repeat(64);
  const decision = decidePreviewRelease({
    ...base,
    destinationEvidence: { matched: true, source_sha256: placeholder, destination_sha256: placeholder }
  });
  assert.equal(decision.status, 'NOT_READY');
  assert.ok(decision.blockers.includes('deployed destination integrity not proven'));
});

test('valid-shaped non-placeholder hashes only permit owner approval, never auto-deploy', () => {
  const decision = decidePreviewRelease(base);
  assert.equal(decision.status, 'READY_FOR_OWNER_DEPLOYMENT_APPROVAL');
  assert.deepEqual(decision.blockers, []);
});
