'use strict';
// Explicit fail-closed publication decision. Synthetic checks never prove a real restore.
// The archive checker deliberately returns restore_proven:false. A separate operator
// attestation is required, and even a structurally complete attestation only reaches
// owner-approval status. This module never deploys anything.
const path = require('node:path');
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_BLOB_SHA1 = /^[a-f0-9]{40}$/i;

function validGitBlobSha(value) {
  return typeof value === 'string' && GIT_BLOB_SHA1.test(value) && !/^0{40}$/i.test(value);
}

function validSha(value) {
  return typeof value === 'string' && SHA256.test(value) &&
    !/^0{64}$/i.test(value) && value.toLowerCase() !== EMPTY_SHA256;
}
function validUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
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

function matchesCanonicalRealpath(inputPath, realpath) {
  return typeof inputPath === 'string' && typeof realpath === 'string' &&
    path.isAbsolute(inputPath) && path.isAbsolute(realpath) &&
    path.resolve(inputPath) === inputPath &&
    path.resolve(realpath) === realpath &&
    inputPath === realpath;
}

// This is a schema/consistency check for an operator-supplied record, not proof.
// A structurally complete record must never be labelled release-ready by this module.
function hasIndependentRestoreAttestation(evidence) {
  if (!evidence || evidence.restore_proven !== true ||
      evidence.evidence !== 'independent-restore-manifest-v1') return false;
  if (evidence.backup_provider !== 'iranhost' ||
      evidence.source_site_origin !== 'https://mehdisehat.ir') return false;
  if (typeof evidence.backup_id !== 'string' || !evidence.backup_id.trim() ||
      evidence.backup_id.length > 160 ||
      [...evidence.backup_id].some(character => {
        const code = character.codePointAt(0);
        return code <= 0x1f || code === 0x7f;
      })) return false;
  if (!Number.isSafeInteger(evidence.archive_size_bytes) || evidence.archive_size_bytes <= 0) return false;
  if (!validUtc(evidence.backup_created_at)) return false;
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
  // Require the operator's canonical realpath observations, not merely lexical paths.
  // This rejects a symlink alias that appears outside the web root but resolves inside it.
  if (!matchesCanonicalRealpath(evidence.restore_target_path, evidence.restore_target_realpath) ||
      !matchesCanonicalRealpath(evidence.production_document_root, evidence.production_document_root_realpath) ||
      !outsideDocumentRoot(evidence.restore_target_realpath, evidence.production_document_root_realpath)) return false;
  if (!validUtc(evidence.restore_completed_at) || !validUtc(evidence.reviewed_at)) return false;
  if (Date.parse(evidence.backup_created_at) > Date.parse(evidence.restore_completed_at)) return false;
  if (Date.parse(evidence.reviewed_at) < Date.parse(evidence.restore_completed_at)) return false;
  return true;
}

function hasVerifiedStagingDestination(evidence) {
  if (!evidence || evidence.matched !== true || evidence.destination_outside_document_root !== true ||
      evidence.destination_outside_git_checkout !== true) return false;
  if (!validGitBlobSha(evidence.source_blob_sha1) || !validGitBlobSha(evidence.expected_source_blob_sha1) ||
      evidence.source_blob_sha1.toLowerCase() !== evidence.expected_source_blob_sha1.toLowerCase()) return false;
  if (!validSha(evidence.source_sha256) || !validSha(evidence.destination_sha256) || evidence.source_sha256.toLowerCase() !== evidence.destination_sha256.toLowerCase()) return false;
  if (typeof evidence.destination_realpath !== 'string' || typeof evidence.production_document_root_realpath !== 'string' ||
      typeof evidence.git_checkout_realpath !== 'string' || !path.isAbsolute(evidence.destination_realpath) ||
      !path.isAbsolute(evidence.production_document_root_realpath) || !path.isAbsolute(evidence.git_checkout_realpath)) return false;
  if (path.resolve(evidence.destination_realpath) !== evidence.destination_realpath ||
      path.resolve(evidence.production_document_root_realpath) !== evidence.production_document_root_realpath ||
      path.resolve(evidence.git_checkout_realpath) !== evidence.git_checkout_realpath) return false;
  return outsideDocumentRoot(evidence.destination_realpath, evidence.production_document_root_realpath) &&
    outsideDocumentRoot(evidence.destination_realpath, evidence.git_checkout_realpath);
}

function decidePreviewRelease({ restoreEvidence, destinationEvidence, isolatedRestoreVerified = false, mobileBrowserVerified = false, zeroApiRequestsVerified = false, humanReviewVerified = false, authenticatedHumanReviewAttested = false, authenticatedRestoreAttestation = false } = {}) {
  const blockers = [];
  if (!hasIndependentRestoreAttestation(restoreEvidence) || isolatedRestoreVerified !== true)
    blockers.push('independent restore attestation incomplete or unverified');
  if (authenticatedRestoreAttestation !== true)
    blockers.push('two-party restore signatures and independently pinned key fingerprints missing');
  if (!hasVerifiedStagingDestination(destinationEvidence))
    blockers.push('preview destination is not verified outside production document root and Git checkout');
  if (mobileBrowserVerified !== true) blockers.push('real mobile browser test missing');
  if (zeroApiRequestsVerified !== true) blockers.push('zero API requests not observed');
  if (humanReviewVerified !== true) blockers.push('human review approval missing');
  if (authenticatedHumanReviewAttested !== true) blockers.push('authenticated human reviewer attestation missing');
  return Object.freeze({
    status: blockers.length ? 'NOT_READY' : 'EVIDENCE_SHAPE_VALID_REQUIRES_EXTERNAL_VERIFICATION',
    blockers,
    externalChecksPending: Object.freeze([
      'restore signatures and key fingerprints establish integrity against supplied pins only; real-world signer identities and the actual restore operation remain independently unverified',
      'operator-supplied restore and destination attestations have not been independently authenticated',
      'reviewer identity and approval have not been independently authenticated against a trusted identity source',
      'live HTTPS response, hosting headers, and live mobile behavior have not been verified by this tool',
      'independent legal/security review and explicit owner approval remain separate requirements'
    ]),
    deploymentAuthorized: false
  });
}
module.exports = { decidePreviewRelease, hasIndependentRestoreAttestation, hasVerifiedStagingDestination, validGitBlobSha };
