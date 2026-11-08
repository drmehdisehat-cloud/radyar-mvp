'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');
const hash = 'a'.repeat(64);
const destinationEvidence = { matched: true, source_sha256: hash, destination_sha256: hash };
test('synthetic backup and destination success cannot authorize deployment', () => {
  const decision = decidePreviewRelease({restoreEvidence:{restore_proven:false},destinationEvidence});
  assert.equal(decision.status,'NOT_READY');
  assert.ok(decision.blockers.includes('independent restore not proven'));
});
test('all browser and review flags still fail without real restore proof', () => {
  const decision = decidePreviewRelease({restoreEvidence:{restore_proven:false},destinationEvidence,isolatedRestoreVerified:true,mobileBrowserVerified:true,zeroApiRequestsVerified:true,humanReviewVerified:true});
  assert.equal(decision.status,'NOT_READY');
});
test('tampered destination hash fails even when other flags are true', () => {
  const decision = decidePreviewRelease({restoreEvidence:{restore_proven:true},destinationEvidence:{...destinationEvidence,destination_sha256:'b'.repeat(64)},isolatedRestoreVerified:true,mobileBrowserVerified:true,zeroApiRequestsVerified:true,humanReviewVerified:true});
  assert.equal(decision.status,'NOT_READY');
});
test('only complete independently verified evidence is eligible for owner approval, not automatic publication', () => {
  const decision = decidePreviewRelease({restoreEvidence:{restore_proven:true},destinationEvidence,isolatedRestoreVerified:true,mobileBrowserVerified:true,zeroApiRequestsVerified:true,humanReviewVerified:true});
  assert.equal(decision.status,'READY_FOR_OWNER_DEPLOYMENT_APPROVAL');
});
