'use strict';
// Explicit fail-closed publication decision. Synthetic checks never prove a real restore.
// The archive checker deliberately returns restore_proven:false. A separate operator
// attestation is required, and even a structurally complete attestation only reaches
// owner-approval status. This module never deploys anything.
const path = require('node:path');
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SHA256 = /^[a-f0-9]{64}$/i;

function validSha(value) {
  return typeof value === 'string' && SHA256.test(value) &&
    !/^0{64}$/i.test(value) && value.toLowerCase() !== EMPTY_SHA256;
}
function validUtc(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value &&
    parsed.getTime() <= Date.now();
}
function outsideDocumentRoot(target, documentRoot) {
  if (typeof target !== 'string' || typeof documentRoot !== 'string' ||
      !path.isAbsolute(target) || !path.isAbsolute(documentRoot)) return false;
  const relative = path.relative(path.resolve(documentRoot), path.resolve(target));
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}

// This is a schema/consistency check for an independently collected operator record,
// not cryptographic proof. The reviewer must inspect the actual hosting evidence.
function hasIndependentRestoreAttestation(evidence) {
  if (!evidence || evidence.restore_proven !== true ||
      evidence.evidence !== 'independent-restore-manifest-v1') return false;
  if (!validSha(evidence.archive_sha256) ||
      !validSha(evidence.restored_marker_sha256) ||
      !validSha(evidence.restore_log_sha256) ||
      !validSha(evidence.database_probe_sha256)) return false;
  if (evidence.restore_exit_code !== 0 ||
      evidence.restore_target_isolated !== true ||
      evidence.production_database_untouched !== true ||
      evidence.database_probe_passed !== true ||
      evidence.outbound_integrations_disabled !== true ||
      evidence.reviewer_attested !== true) return false;
  for (const key of ['restore_target_id', 'restore_operator', 'independent_reviewer',
    'restore_database_name', 'production_database_name',
    'restore_database_user', 'production_database_user']) {
    if (typeof evidence[key] !== 'string' || !evidence[key].trim()) return false;
  }
  if (evidence.restore_operator.trim().toLowerCase() ===
      evidence.independent_reviewer.trim().toLowerCase()) return false;
  if (evidence.restore_database_name.trim().toLowerCase() ===
      evidence.production_database_name.trim().toLowerCase()) return false;
  if (evidence.restore_database_user.trim().toLowerCase() ===
      evidence.production_database_user.trim().toLowerCase()) return false;
  if (!outsideDocumentRoot(evidence.restore_target_path, evidence.production_document_root)) return false;
  if (!validUtc(evidence.restore_completed_at) || !validUtc(evidence.reviewed_at)) return false;
  if (Date.parse(evidence.reviewed_at) < Date.parse(evidence.restore_completed_at)) return false;
  return true;
}

function decidePreviewRelease({ restoreEvidence, destinationEvidence, isolatedRestoreVerified = false, mobileBrowserVerified = false, zeroApiRequestsVerified = false, humanReviewVerified = false } = {}) {
  const blockers = [];
  if (!hasIndependentRestoreAttestation(restoreEvidence) || isolatedRestoreVerified !== true)
    blockers.push('independent restore attestation incomplete or unverified');
  if (destinationEvidence?.matched !== true ||
      !validSha(destinationEvidence?.source_sha256) ||
      !validSha(destinationEvidence?.destination_sha256) ||
      destinationEvidence.source_sha256 !== destinationEvidence.destination_sha256)
    blockers.push('deployed destination integrity not proven');
  if (mobileBrowserVerified !== true) blockers.push('real mobile browser test missing');
  if (zeroApiRequestsVerified !== true) blockers.push('zero API requests not observed');
  if (humanReviewVerified !== true) blockers.push('human review approval missing');
  return Object.freeze({
    status: blockers.length ? 'NOT_READY' : 'READY_FOR_OWNER_DEPLOYMENT_APPROVAL',
    blockers
  });
}
module.exports = { decidePreviewRelease, hasIndependentRestoreAttestation };
