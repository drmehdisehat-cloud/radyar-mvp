'use strict';
// Local, read-only release preflight. This script never deploys or writes evidence.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { decidePreviewRelease, hasVerifiedRepositoryPosture } = require('./decide-preview-release.cjs');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');
const { parseJsonRejectDuplicateKeys } = require('./strict-json.cjs');
const { verifyHumanReviewAttestation } = require('./verify-human-review-attestation.cjs');
const { verifyPinnedRestoreAttestation } = require('./verify-restore-attestation-pinned.cjs');
const { readExternalFile } = require('./verify-restore-attestation-signatures.cjs');
const { verifyRestoreEvidenceBundle } = require('./verify-restore-evidence-bundle.cjs');
const { verifyPreview } = require('./verify-preview-destination.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');

// Bind a signed review to the exact checkout being preflighted, not merely to
// a caller-supplied 40-hex label and a separately matching local file.
function verifyReviewedSourceCommit(expectedCommit, expectedBlobSha1) {
  const commit = typeof expectedCommit === 'string' ? expectedCommit.toLowerCase() : '';
  const blob = typeof expectedBlobSha1 === 'string' ? expectedBlobSha1.toLowerCase() : '';
  if (!/^[a-f0-9]{40}$/.test(commit) || /^0{40}$/.test(commit)) {
    throw new Error('invalid_reviewed_source_commit');
  }
  if (!/^[a-f0-9]{40}$/.test(blob) || /^0{40}$/.test(blob)) {
    throw new Error('invalid_reviewed_source_blob_sha1');
  }
  const git = (...args) => {
    try {
      return execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim().toLowerCase();
    } catch {
      throw new Error('reviewed_source_git_verification_failed');
    }
  };
  const head = git('rev-parse', '--verify', 'HEAD^{commit}');
  if (head !== commit) throw new Error('reviewed_source_commit_must_match_checkout_HEAD');
  const committedBlob = git('rev-parse', '--verify', commit + ':dadyar-preview/index.html');
  if (!/^[a-f0-9]{40}$/.test(committedBlob)) {
    throw new Error('reviewed_source_commit_preview_blob_invalid');
  }
  if (committedBlob !== blob) throw new Error('reviewed_source_commit_blob_mismatch');
  return Object.freeze({ verified: true, commit: head, blob_sha1: committedBlob });
}
const MAX_EVIDENCE_BYTES = 64 * 1024;
const MAX_PUBLIC_KEY_BYTES = 16 * 1024;
const MAX_SIGNATURE_BYTES = 64;
const USAGE = [
  'Usage:',
  '  node scripts/preview-release-preflight.cjs --restore-evidence ABSOLUTE_JSON_PATH',
  '    --restore-archive ABSOLUTE_FILE --restore-marker ABSOLUTE_FILE',
  '    --restore-log ABSOLUTE_FILE --restore-database-probe ABSOLUTE_FILE',
  '    --restore-operator-public-key ABSOLUTE_PEM --restore-operator-signature ABSOLUTE_FILE',
  '    --restore-reviewer-public-key ABSOLUTE_PEM --restore-reviewer-signature ABSOLUTE_FILE',
  '    --expected-restore-operator-public-key-sha256 64_HEX --expected-restore-reviewer-public-key-sha256 64_HEX',
  '    --destination-evidence ABSOLUTE_JSON_PATH',
  '    --preview-source CHECKOUT/dadyar-preview/index.html',
  '    --preview-destination STAGING/dadyar-preview/index.html',
  '    --production-document-root ABSOLUTE_PRODUCTION_DOCUMENT_ROOT',
  '    --expected-source-blob-sha1 40_HEX',
  '    --review-attestation ABSOLUTE_JSON_PATH --review-trust-store ABSOLUTE_JSON_PATH',
  '    --expected-source-commit 40_HEX --expected-artifact-sha256 64_HEX',
  '    --expected-review-trust-store-sha256 64_HEX (optional consistency check)',
  '  Owner-controlled environment pin: DADYAR_REVIEW_TRUST_STORE_SHA256=64_HEX',
  '    --isolated-restore-verified --mobile-browser-verified',
  '    --zero-api-requests-verified --local-human-review-acknowledged',
  '',
  'read-only preflight; it never deploys or writes evidence.',
  'Repository posture observation must be a fresh (15-minute), read-only audit result bound to the exact expected source commit.',
  'Restore archive/log/database-probe, repository posture, and attestation files must be outside the Git checkout.',
  'On POSIX, JSON evidence, attestations and trust stores must be root/service-owned and owner-only (0600/0400), without special bits.',
  'The restored marker must be inside the isolated restore target; the preview destination must be outside production and checkout.',
  'The detached Ed25519 signature is checked against the supplied trust store.',
  'The trust-store digest is anchored by the owner-controlled DADYAR_REVIEW_TRUST_STORE_SHA256 environment setting; the CLI digest is only an optional consistency check.',
  'This script never deploys and does not independently establish human identity or the organizational independence of a key holder.'
].join('\n');

const FLAG_NAMES = new Set([
  '--isolated-restore-verified',
  '--mobile-browser-verified',
  '--zero-api-requests-verified',
  '--local-human-review-acknowledged'
]);
const VALUE_NAMES = new Set([
  '--restore-evidence',
  '--restore-archive',
  '--restore-marker',
  '--restore-log',
  '--restore-database-probe',
  '--destination-evidence',
  '--repository-posture-observation',
  '--preview-source',
  '--preview-destination',
  '--production-document-root',
  '--review-attestation',
  '--review-trust-store',
  '--restore-operator-public-key',
  '--restore-operator-signature',
  '--restore-reviewer-public-key',
  '--restore-reviewer-signature',
  '--expected-restore-operator-public-key-sha256',
  '--expected-restore-reviewer-public-key-sha256',
  '--expected-source-blob-sha1',
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

function assertPrivateEvidencePermissions(stat, label) {
  if (process.platform === 'win32') return;
  const serviceUid = typeof process.geteuid === 'function' ? BigInt(process.geteuid()) : null;
  if (serviceUid === null || (stat.uid !== 0n && stat.uid !== serviceUid)) {
    throw new Error(label + '_must_be_owned_by_root_or_service_user');
  }
  const mode = stat.mode & 0o7777n;
  if ((mode & 0o7000n) !== 0n) throw new Error(label + '_special_permission_bits_forbidden');
  if ((mode & 0o022n) !== 0n) throw new Error(label + '_must_not_be_group_or_world_writable');
  if ((mode & 0o400n) === 0n) throw new Error(label + '_must_be_owner_readable');
  if ((mode & 0o077n) !== 0n) throw new Error(label + '_must_be_owner_only');
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
  assertPrivateEvidencePermissions(stable.stat, flag);
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

function resolveOwnerPinnedReviewTrustStoreSha256(cliValue, env = process.env) {
  const configured = env && env.DADYAR_REVIEW_TRUST_STORE_SHA256;
  if (typeof configured !== 'string' || !/^[a-f0-9]{64}$/i.test(configured) ||
      /^0{64}$/i.test(configured)) {
    return { digest: null, reason: 'owner_managed_review_trust_store_pin_missing_or_invalid' };
  }
  const digest = configured.toLowerCase();
  if (cliValue !== undefined &&
      (typeof cliValue !== 'string' || !/^[a-f0-9]{64}$/i.test(cliValue) ||
       cliValue.toLowerCase() !== digest)) {
    return { digest: null, reason: 'review_trust_store_cli_pin_mismatch' };
  }
  return { digest, reason: null };
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
      if (['--restore-evidence', '--restore-archive', '--restore-marker', '--restore-log',
        '--restore-database-probe', '--destination-evidence', '--preview-source',
        '--preview-destination', '--production-document-root', '--review-attestation', '--review-trust-store',
        '--restore-operator-public-key', '--restore-operator-signature',
        '--restore-reviewer-public-key', '--restore-reviewer-signature',
        '--repository-posture-observation'].includes(arg)) {
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

    const restoreBundlePaths = {
      archivePath: args.paths['--restore-archive'],
      restoredMarkerPath: args.paths['--restore-marker'],
      restoreLogPath: args.paths['--restore-log'],
      databaseProbePath: args.paths['--restore-database-probe']
    };
    if (Object.values(restoreBundlePaths).some(value => !value)) {
      throw new Error('restore_evidence_bundle_files_required');
    }
    const restoreEvidenceBundle = verifyRestoreEvidenceBundle({
      manifest: restoreEvidence,
      ...restoreBundlePaths
    });

    const previewSource = args.paths['--preview-source'];
    const previewDestination = args.paths['--preview-destination'];
    const productionDocumentRoot = args.paths['--production-document-root'];
    const expectedSourceBlobSha1 = args.values['--expected-source-blob-sha1'];
    if (!previewSource || !previewDestination || !productionDocumentRoot || !expectedSourceBlobSha1) {
      throw new Error('preview_destination_files_and_source_blob_pin_required');
    }
    const reviewedPreviewSource = path.join(REPO_ROOT, 'dadyar-preview', 'index.html');
    if (previewSource !== reviewedPreviewSource) {
      throw new Error('preview_source_must_be_reviewed_checkout_index');
    }
    const verifiedDestination = verifyPreview(
      previewSource, previewDestination, productionDocumentRoot, expectedSourceBlobSha1
    );
    for (const [key, value] of Object.entries(verifiedDestination)) {
      if (destinationEvidence[key] !== value) {
        throw new Error('destination_evidence_mismatch:' + key);
      }
    }

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

    const ownerTrustPin = resolveOwnerPinnedReviewTrustStoreSha256(
      args.values['--expected-review-trust-store-sha256']
    );
    let review = {
      verified: false,
      reason: ownerTrustPin.reason || 'review_attestation_and_trust_store_required'
    };
    const reviewPath = args.paths['--review-attestation'];
    const trustPath = args.paths['--review-trust-store'];
    const expectedSourceCommit = args.values['--expected-source-commit'];
    const repositoryPosturePath = args.paths['--repository-posture-observation'];
    const repositoryPostureObservation = repositoryPosturePath
      ? readEvidence('--repository-posture-observation', repositoryPosturePath)
      : null;
    const expectedArtifactSha256 = args.values['--expected-artifact-sha256'];
    const expectedTrustStoreSha256 = ownerTrustPin.digest;
    const hasCoreReviewInputs = reviewPath && trustPath && expectedSourceCommit && expectedArtifactSha256;
    if (hasCoreReviewInputs && expectedTrustStoreSha256) {
      const sourceCheckout = verifyReviewedSourceCommit(
        expectedSourceCommit, verifiedDestination.expected_source_blob_sha1
      );
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
              expectedSourceBlobSha1: verifiedDestination.expected_source_blob_sha1,
              expectedArtifactSha256,
              forbiddenPublicKeySha256s: restoreAttestation.verified === true
                ? [
                    restoreAttestation.operator_public_key_sha256,
                    restoreAttestation.reviewer_public_key_sha256
                  ]
                : []
            }),
            trustStoreSha256: trustStoreRecord.sha256,
            sourceCheckoutVerified: sourceCheckout.verified,
            sourceCheckoutCommit: sourceCheckout.commit,
            sourceCheckoutBlobSha1: sourceCheckout.blob_sha1
          };
        }
      }
    } else if (hasCoreReviewInputs && !expectedTrustStoreSha256) {
      review = {
        verified: false,
        reason: ownerTrustPin.reason || 'review_trust_store_digest_required'
      };
    } else if (reviewPath || trustPath || expectedSourceCommit || expectedArtifactSha256 || expectedTrustStoreSha256) {
      review = { verified: false, reason: 'review_attestation_trust_store_and_target_required' };
    }

    const decision = decidePreviewRelease({
      restoreEvidence,
      destinationEvidence: verifiedDestination,
      isolatedRestoreVerified: args.attestations.has('--isolated-restore-verified') && restoreEvidenceBundle.matched === true,
      mobileBrowserVerified: args.attestations.has('--mobile-browser-verified'),
      zeroApiRequestsVerified: args.attestations.has('--zero-api-requests-verified'),
      localHumanReviewAcknowledged: args.attestations.has('--local-human-review-acknowledged'),
      authenticatedHumanReviewAttested: review.verified === true,
      authenticatedRestoreAttestation: restoreAttestation.verified === true,
      repositoryPostureObservation,
      expectedSourceCommit
    });
    const output = {
      ...decision,
      evidenceFilesRead: true,
      attestationFlagsSupplied: args.attestations.size,
      restoreEvidenceBundle: {
        status: restoreEvidenceBundle.status,
        matched: restoreEvidenceBundle.matched,
        files: restoreEvidenceBundle.files,
        databaseProbeSchemaVerified: restoreEvidenceBundle.database_probe_schema_verified,
        restoreOperationIndependentlyVerified: false,
        signerIdentityVerified: false
      },
      destinationVerification: verifiedDestination,
      repositoryPosture: repositoryPostureObservation ? {
        verified: hasVerifiedRepositoryPosture(repositoryPostureObservation, expectedSourceCommit),
        status: typeof repositoryPostureObservation.status === 'string' ? repositoryPostureObservation.status : 'unknown',
        visibility: typeof repositoryPostureObservation.visibility === 'string' ? repositoryPostureObservation.visibility : 'unknown',
        branchProtected: repositoryPostureObservation.branchProtected === true,
        headSha: typeof repositoryPostureObservation.headSha === 'string' ? repositoryPostureObservation.headSha : null,
        observedAt: typeof repositoryPostureObservation.observedAt === 'string' ? repositoryPostureObservation.observedAt : null,
        blockers: Array.isArray(repositoryPostureObservation.blockers)
          ? repositoryPostureObservation.blockers.filter(item => typeof item === 'string').slice(0, 20)
          : ['invalid_posture_blockers']
      } : { verified: false, reason: 'repository_posture_observation_missing' },
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
        sourceCommit: review.sourceCommit,
        sourceBlobSha1: review.sourceBlobSha1,
        trustStoreSha256: review.trustStoreSha256,
        sourceCheckoutVerified: review.sourceCheckoutVerified,
        sourceCheckoutCommit: review.sourceCheckoutCommit,
        sourceCheckoutBlobSha1: review.sourceCheckoutBlobSha1
      } : { verified: false, reason: review.reason },
      deploymentPerformed: false,
      note: 'مشاهده وضعیت خصوصی‌بودن مخزن و حفاظت شاخه باید تازه، read-only و به SHA دقیق منبع متصل باشد. امضای دوطرفه اظهارنامه بازیابی و تطبیق اثرانگشت کلیدها بررسی می‌شود؛ بایت‌های آرشیو، نشانگر بازیابی، گزارش Restore و probe دیتابیس نیز با هش‌های manifest مقایسه می‌شوند. فایل منبع و مقصد پیش‌نمایش از مسیر واقعی دوباره خوانده و هش می‌شوند. این بررسی‌ها هویت واقعی اشخاص، وقوع مستقل Restore، سلامت عملیاتی دیتابیس، پاسخ HTTPS زنده یا مجوز مالک را اثبات نمی‌کنند. این ابزار هرگز مجوز انتشار صادر نمی‌کند.'
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
module.exports = { main, parseArgs, readEvidence, readEvidenceRecord, resolveOwnerPinnedReviewTrustStoreSha256, verifyReviewedSourceCommit };
