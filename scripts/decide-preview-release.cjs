'use strict';
// Explicit fail-closed publication decision. Synthetic checks never prove a real restore.
const assert = require('node:assert/strict');
function decidePreviewRelease({ restoreEvidence, destinationEvidence, isolatedRestoreVerified = false, mobileBrowserVerified = false, zeroApiRequestsVerified = false, humanReviewVerified = false } = {}) {
  const blockers = [];
  if (restoreEvidence?.restore_proven !== true || isolatedRestoreVerified !== true) blockers.push('independent restore not proven');
  if (destinationEvidence?.matched !== true || !/^[a-f0-9]{64}$/i.test(destinationEvidence?.source_sha256 || '') || /^0{64}$/.test(destinationEvidence?.source_sha256 || '') || destinationEvidence.source_sha256 !== destinationEvidence.destination_sha256) blockers.push('deployed destination integrity not proven');
  if (mobileBrowserVerified !== true) blockers.push('real mobile browser test missing');
  if (zeroApiRequestsVerified !== true) blockers.push('zero API requests not observed');
  if (humanReviewVerified !== true) blockers.push('human review approval missing');
  return Object.freeze({ status: blockers.length ? 'NOT_READY' : 'READY_FOR_OWNER_DEPLOYMENT_APPROVAL', blockers });
}
module.exports = { decidePreviewRelease };
