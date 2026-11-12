'use strict';
// Local, read-only release preflight. This script never deploys or writes evidence.
const fs = require('node:fs');
const path = require('node:path');
const { decidePreviewRelease } = require('./decide-preview-release.cjs');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');
const { verifyHumanReviewAttestation } = require('./verify-human-review-attestation.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAX_EVIDENCE_BYTES = 64 * 1024;
const USAGE = [
  'Usage:',
  '  node scripts/preview-release-preflight.cjs --restore-evidence ABSOLUTE_JSON_PATH',
  '    --destination-evidence ABSOLUTE_JSON_PATH',
  '    --review-attestation ABSOLUTE_JSON_PATH --review-trust-store ABSOLUTE_JSON_PATH',
  '    --expected-source-commit 40_HEX --expected-artifact-sha256 64_HEX',
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
  '--expected-source-commit',
  '--expected-artifact-sha256'
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

function readEvidence(flag, file) {
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
  let value;
  try {
    value = JSON.parse(stable.bytes.toString('utf8'));
  } catch {
    throw new Error(flag + '_is_not_valid_json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(flag + '_must_contain_a_json_object');
  }
  return value;
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
      if (arg === '--restore-evidence' || arg === '--destination-evidence' ||
          arg === '--review-attestation' || arg === '--review-trust-store') {
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

    let review = { verified: false, reason: 'review_attestation_and_trust_store_required' };
    const reviewPath = args.paths['--review-attestation'];
    const trustPath = args.paths['--review-trust-store'];
    const expectedSourceCommit = args.values['--expected-source-commit'];
    const expectedArtifactSha256 = args.values['--expected-artifact-sha256'];
    if (reviewPath && trustPath && expectedSourceCommit && expectedArtifactSha256) {
      const attestation = readEvidence('--review-attestation', reviewPath);
      const trustStore = readEvidence('--review-trust-store', trustPath);
      review = verifyHumanReviewAttestation({
        attestation,
        trustStore,
        expectedSourceCommit,
        expectedArtifactSha256
      });
    } else if (reviewPath || trustPath || expectedSourceCommit || expectedArtifactSha256) {
      review = { verified: false, reason: 'review_attestation_trust_store_and_target_required' };
    }

    const decision = decidePreviewRelease({
      restoreEvidence,
      destinationEvidence,
      isolatedRestoreVerified: args.attestations.has('--isolated-restore-verified'),
      mobileBrowserVerified: args.attestations.has('--mobile-browser-verified'),
      zeroApiRequestsVerified: args.attestations.has('--zero-api-requests-verified'),
      humanReviewVerified: args.attestations.has('--human-review-verified'),
      authenticatedHumanReviewAttested: review.verified === true
    });
    const output = {
      ...decision,
      evidenceFilesRead: true,
      attestationFlagsSupplied: args.attestations.size,
      reviewAttestation: review.verified ? {
        verified: true,
        issuer: review.issuer,
        subject: review.subject,
        reviewId: review.reviewId,
        reviewedAt: review.reviewedAt,
        expiresAt: review.expiresAt
      } : { verified: false, reason: review.reason },
      deploymentPerformed: false,
      note: 'فقط امضای دیجیتال و سازگاری ساختاری اظهار بازبینی با کلید عمومی ارائه‌شده بررسی شده است؛ منشأ مستقل trust store، هویت واقعی صاحب کلید، بازیابی واقعی بکاپ، مقصد زنده و مجوز مالک احراز نشده‌اند. این ابزار هرگز مجوز انتشار صادر نمی‌کند.'
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
module.exports = { main, parseArgs, readEvidence };
