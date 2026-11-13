'use strict';
// Local, read-only release preflight. This script never deploys or writes evidence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { decidePreviewRelease } = require('./decide-preview-release.cjs');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');
const { parseJsonRejectDuplicateKeys } = require('./strict-json.cjs');
const { verifyHumanReviewAttestation } = require('./verify-human-review-attestation.cjs');
const { verifyPinnedRestoreAttestation } = require('./verify-restore-attestation-pinned.cjs');
const { readExternalFile } = require('./verify-restore-attestation-signatures.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAX_EVIDENCE_BYTES = 64 * 1024;
const MAX_PUBLIC_KEY_BYTES = 16 * 1024;
const MAX_SIGNATURE_BYTES = 64;
const USAGE = [
  'Usage:',
  '  node scripts/preview-release-preflight.cjs --restore-evidence ABSOLUTE_JSON_PATH',
  '    --restore-operator-public-key ABSOLUTE_PEM --restore-operator-signature ABSOLUTE_FILE',
  '    --restore-reviewer-public-key ABSOLUTE_PEM --restore-reviewer-signature ABSOLUTE_FILE',
  '    --expected-restore-operator-public-key-sha256 64_HEX --expected-restore-reviewer-public-key-sha256 64_HEX',
  '    --destination-evidence ABSOLUTE_JSON_PATH',
  '    --review-attestation ABSOLUTE_JSON_PATH --review-trust-store ABSOLUTE_JSON_PATH',
  '    --expected-source-commit 40_HEX --expected-artifact-sha256 64_HEX',
  '    --expected-review-trust-store-sha256 64_HEX',
  '    --isolated-restore-verified --mobile-browser-verified',
  '    --zero-api-requests-verified --human-review-verified',
  '',
  'read-only preflight; it never deploys or writes evidence.',
  'Evidence, attestation and trust-store files must be outside the Git checkout.',
  'The detached Ed25519 signature is checked against the supplied trust store.',
  'This script never deploys and does not independently establish the trust-store origin or human identity.'
].join('\n');

const FLAG_NAMES = new Set([
  '--isolated-restore-verified',
  '--mobile-browser-verified',
  '--zero-api-requests-verified',
  '--human-review-verified'
]);
const VALUE_NAMES = new Set([
  '--restore-evidence',
  '--destination-evidence',
  '--review-attestation',
  '--review-trust-store',
  '--restore-operator-public-key',
  '--restore-operator-signature',
  '--restore-reviewer-public-key',
  '--restore-reviewer-signature',
  '--expected-restore-operator-public-key-sha256',
  '--expected-restore-reviewer-public-key-sha256',
  '--expected-source-commit',
  '--expected-artifact-sha256',
  '--expected-review-trust-store-sha256'
]);

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function assertNoSymlinkComponents(target) {
  let current = path.resolve(target);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('evidence_path_contains_symlink');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function readEvidenceRecord(flag, file) {
  if (!path.isAbsolute(file)) throw new Error(flag + '_must_be_absolute');
  assertNoSymlinkComponents(file);
  const realPath = fs.realpathSync(file);
  if (isInside(REPO_ROOT, realPath)) throw new Error(flag + '_must_be_outside_git_checkout');
  // Read evidence through a no-follow descriptor, reject hard-link aliases,
  // enforce the size budget before allocating bytes, and verify the file did
  // not change while being read.
  const stable = readStableRegularFile(realPath, flag, {
    includeBytes: true,
    maxBytes: MAX_EVIDENCE_BYTES
  });
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(stable.bytes);
  } catch {
    throw new Error(flag + '_is_not_valid_utf8');
  }
  let value;
  try {
    value = parseJsonRejectDuplicateKeys(decoded);
  } catch (error) {
    if (error instanceof SyntaxError && String(error.message).startsWith('duplicate_json_key:')) {
      throw error;
    }
    throw new Error(flag + '_is_not_valid_json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(flag + '_must_contain_a_json_object');
  }
  return { value, sha256: stable.sha256 };
}

function readEvidence(flag, file) {
  return readEvidenceRecord(flag, file).value;
}

function parseArgs(argv) {
  const parsed = { help: false, paths: {}, values: {}, attestations: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (VALUE_NAMES.has(arg)) {
      if (Object.prototype.hasOwnProperty.call(parsed.paths, arg) ||
          Object.prototype.hasOwnProperty.call(parsed.values, arg)) {
        throw new Error('duplicate_argument:' + arg);
      }
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error('missing_value:' + arg);
      if (['--restore-evidence', '--destination-evidence', '--review-attestation', '--review-trust-store',
        '--restore-operator-public-key', '--restore-operator-signature',
        '--restore-reviewer-public-key', '--restore-reviewer-signature'].includes(arg)) {
        parsed.paths[arg] = value;
      } else {
        parsed.values[arg] = value;
      }
      continue;
    }
    if (FLAG_NAMES.has(arg)) {
      if (parsed.attestations.has(arg)) throw new Error('duplicate_argument:' + arg);
      parsed.attestations.add(arg);
      continue;
    }
    throw new Error('unknown_argument:' + arg);
  }
  return parsed;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(USAGE + '\n');
      return 0;
    }
    const restorePath = args.paths['--restore-evidence'];
    const destinationPath = args.paths['--destination-evidence'];
    if (!restorePath || !destinationPath) throw new Error('both_evidence_files_required');
    const restoreEvidence = readEvidence('--restore-evidence', restorePath);
    const destinationEvidence = readEvidence('--destination-evidence', destinationPath);

    const restorePathFlags = [
      '--restore-operator-public-key', '--restore-operator-signature',
      '--restore-reviewer-public-key', '--restore-reviewer-signature'
    ];
    const restoreValueFlags = [
      '--expected-restore-operator-public-key-sha256',
      '--expected-restore-reviewer-public-key-sha256'
    ];
    const hasAnyRestoreAttestationInput = [...restorePathFlags, ...restoreValueFlags]
      .some(flag => args.paths[flag] || args.values[flag]);
    const hasAllRestoreAttestationInputs = restorePathFlags.every(flag => args.paths[flag]) &&
      restoreValueFlags.every(flag => args.values[flag]);
    let restoreAttestation = {
      verified: false,
      reason: 'two_party_restore_signatures_and_owner_pinned_key_fingerprints_required'
    };
    if (hasAllRestoreAttestationInputs) {
      try {
        const restoreVerification = verifyPinnedRestoreAttestation({
          manifest: restoreEvidence,
          operatorPublicKeyPem: readExternalFile(args.paths['--restore-operator-public-key'],
            'restore_operator_public_key', MAX_PUBLIC_KEY_BYTES).toString('utf8'),
          operatorSignature: readExternalFile(args.paths['--restore-operator-signature'],
            'restore_operator_signature', MAX_SIGNATURE_BYTES),
          reviewerPublicKeyPem: readExternalFile(args.paths['--restore-reviewer-public-key'],
            'restore_reviewer_public_key', MAX_PUBLIC_KEY_BYTES).toString('utf8'),
          reviewerSignature: readExternalFile(args.paths['--restore-reviewer-signature'],
            'restore_reviewer_signature', MAX_SIGNATURE_BYTES),
          expectedOperatorFingerprint: args.values['--expected-restore-operator-public-key-sha256'],
          expectedReviewerFingerprint: args.values['--expected-restore-reviewer-public-key-sha256']
        });
        restoreAttestation = { verified: true, ...restoreVerification };
      } catch (error) {
        restoreAttestation = {
          verified: false,
          reason: String(error && error.message || 'restore_attestation_verification_failed').slice(0, 180)
        };
      }
    } else if (hasAnyRestoreAttestationInput) {
      restoreAttestation = { verified: false, reason: 'restore_attestation_inputs_incomplete' };
    }

    let review = { verified: false, reason: 'review_attestation_and_trust_store_required' };
    const reviewPath = args.paths['--review-attestation'];
    const trustPath = args.paths['--review-trust-store'];
    const expectedSourceCommit = args.values['--expected-source-commit'];
    const expectedArtifactSha256 = args.values['--expected-artifact-sha256'];
    const expectedTrustStoreSha256 = args.values['--expected-review-trust-store-sha256'];
    const hasCoreReviewInputs = reviewPath && trustPath && expectedSourceCommit && expectedArtifactSha256;
    if (hasCoreReviewInputs && expectedTrustStoreSha256) {
      const attestation = readEvidence('--review-attestation', reviewPath);
      const trustStoreRecord = readEvidenceRecord('--review-trust-store', trustPath);
      if (!/^[a-f0-9]{64}$/i.test(expectedTrustStoreSha256) || /^0{64}$/i.test(expectedTrustStoreSha256)) {
        review = { verified: false, reason: 'invalid_expected_review_trust_store_sha256' };
      } else {
        const expectedDigest = Buffer.from(expectedTrustStoreSha256, 'hex');
        const actualDigest = Buffer.from(trustStoreRecord.sha256, 'hex');
        if (!crypto.timingSafeEqual(expectedDigest, actualDigest)) {
          review = { verified: false, reason: 'review_trust_store_digest_mismatch' };
        } else {
          review = {
            ...verifyHumanReviewAttestation({
              attestation,
              trustStore: trustStoreRecord.value,
              expectedSourceCommit,
              expectedSourceBlobSha1: destinationEvidence.expected_source_blob_sha1,
              expectedArtifactSha256
            }),
            trustStoreSha256: trustStoreRecord.sha256
          };
        }
      }
    } else if (hasCoreReviewInputs && !expectedTrustStoreSha256) {
      review = { verified: false, reason: 'review_trust_store_digest_required' };
    } else if (reviewPath || trustPath || expectedSourceCommit || expectedArtifactSha256 || expectedTrustStoreSha256) {
      review = { verified: false, reason: 'review_attestation_trust_store_and_target_required' };
    }

    const decision = decidePreviewRelease({
      restoreEvidence,
      destinationEvidence,
      isolatedRestoreVerified: args.attestations.has('--isolated-restore-verified'),
      mobileBrowserVerified: args.attestations.has('--mobile-browser-verified'),
      zeroApiRequestsVerified: args.attestations.has('--zero-api-requests-verified'),
      humanReviewVerified: args.attestations.has('--human-review-verified'),
      authenticatedHumanReviewAttested: review.verified === true,
      authenticatedRestoreAttestation: restoreAttestation.verified === true
    });
    const output = {
      ...decision,
      evidenceFilesRead: true,
      attestationFlagsSupplied: args.attestations.size,
      restoreAttestation: restoreAttestation.verified ? {
        verified: true,
        status: restoreAttestation.status,
        manifestSha256: restoreAttestation.manifest_sha256,
        operatorPublicKeySha256: restoreAttestation.operator_public_key_sha256,
        reviewerPublicKeySha256: restoreAttestation.reviewer_public_key_sha256,
        keyFingerprintsPinned: restoreAttestation.key_fingerprints_pinned,
        signerIdentityIndependentlyVerified: false,
        restoreOperationIndependentlyVerified: false
      } : { verified: false, reason: restoreAttestation.reason },
      reviewAttestation: review.verified ? {
        verified: true,
        issuer: review.issuer,
        subject: review.subject,
        reviewId: review.reviewId,
        reviewedAt: review.reviewedAt,
        expiresAt: review.expiresAt,
        sourceBlobSha1: review.sourceBlobSha1,
        trustStoreSha256: review.trustStoreSha256
      } : { verified: false, reason: review.reason },
      deploymentPerformed: false,
      note: 'امضای دوطرفه اظهارنامه بازیابی و تطبیق اثرانگشت کلیدها با مقادیر ارائه‌شده از کانال مستقل، و نیز امضای بازبینی انسانی بررسی می‌شوند؛ این بررسی‌ها هویت واقعی اشخاص، انجام واقعی بازیابی، سلامت دیتابیس بازیابی‌شده، مقصد زنده یا مجوز مالک را اثبات نمی‌کنند. این ابزار هرگز مجوز انتشار صادر نمی‌کند.'
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return decision.blockers.length ? 1 : 3;
  } catch (error) {
    const output = {
      status: 'NOT_READY',
      blockers: [String(error && error.message || 'invalid_preflight_input').slice(0, 160)],
      deploymentPerformed: false
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return 2;
  }
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, parseArgs, readEvidence, readEvidenceRecord };
