'use strict';
// Adds an out-of-band SHA-256 fingerprint pin to the existing two-signature
// verifier. A match binds bytes to supplied fingerprints only; it does not
// authenticate real-world identities, prove a restore, or authorize release.
const crypto = require('node:crypto');
const {
  verifyRestoreAttestationSignatures,
  readExternalFile
} = require('./verify-restore-attestation-signatures.cjs');
const { parseJsonRejectDuplicateKeys } = require('./strict-json.cjs');

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const FLAGS = [
  '--manifest',
  '--operator-public-key',
  '--operator-signature',
  '--reviewer-public-key',
  '--reviewer-signature',
  '--expected-operator-public-key-sha256',
  '--expected-reviewer-public-key-sha256'
];

function parseArgs(argv) {
  const values = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!FLAGS.includes(arg)) throw new Error('unknown_argument:' + arg);
    if (Object.hasOwn(values, arg)) throw new Error('duplicate_argument:' + arg);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('missing_value:' + arg);
    values[arg] = value;
  }
  for (const flag of FLAGS) {
    if (!values[flag]) throw new Error('required_argument_missing:' + flag);
  }
  for (const flag of ['--expected-operator-public-key-sha256', '--expected-reviewer-public-key-sha256']) {
    if (!SHA256_HEX.test(values[flag])) throw new Error('invalid_sha256_fingerprint:' + flag);
  }
  return { values };
}

function assertFingerprint(actual, expected, label) {
  const actualBytes = Buffer.from(actual, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  if (actualBytes.length !== 32 || expectedBytes.length !== 32 ||
      !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
    throw new Error(label + '_public_key_fingerprint_mismatch');
  }
}

function verifyPinnedRestoreAttestation({
  manifest,
  operatorPublicKeyPem,
  reviewerPublicKeyPem,
  operatorSignature,
  reviewerSignature,
  expectedOperatorFingerprint,
  expectedReviewerFingerprint
} = {}) {
  if (typeof expectedOperatorFingerprint !== 'string' || !SHA256_HEX.test(expectedOperatorFingerprint)) {
    throw new Error('expected_operator_fingerprint_invalid');
  }
  if (typeof expectedReviewerFingerprint !== 'string' || !SHA256_HEX.test(expectedReviewerFingerprint)) {
    throw new Error('expected_reviewer_fingerprint_invalid');
  }

  const verified = verifyRestoreAttestationSignatures({
    manifest,
    operatorPublicKeyPem,
    reviewerPublicKeyPem,
    operatorSignature,
    reviewerSignature
  });

  assertFingerprint(
    verified.operator_public_key_sha256,
    expectedOperatorFingerprint.toLowerCase(),
    'operator'
  );
  assertFingerprint(
    verified.reviewer_public_key_sha256,
    expectedReviewerFingerprint.toLowerCase(),
    'reviewer'
  );

  return Object.freeze({
    ...verified,
    status: 'SIGNATURES_VERIFIED_AND_FINGERPRINTS_MATCHED',
    key_fingerprints_pinned: true,
    signer_identity_independently_verified: false,
    restore_operation_independently_verified: false,
    deployment_authorized: false
  });
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stdout.write(JSON.stringify({
      status: 'NOT_VERIFIED',
      error: error.message,
      deployment_authorized: false
    }) + '\n');
    return 2;
  }

  if (args.help) {
    process.stdout.write([
      'Usage:',
      '  node scripts/verify-restore-attestation-pinned.cjs --manifest FILE --operator-public-key FILE --operator-signature FILE --reviewer-public-key FILE --reviewer-signature FILE --expected-operator-public-key-sha256 HEX --expected-reviewer-public-key-sha256 HEX',
      'Expected fingerprints must be obtained independently through a trusted channel.',
      'All evidence files must be regular, non-symlink files outside the Git checkout.',
      'A successful result verifies signatures and fingerprint matches only; it does not authenticate people, prove a restore, or authorize deployment.'
    ].join('\n') + '\n');
    return 0;
  }

  try {
    const v = args.values;
    const manifestBytes = readExternalFile(v['--manifest'], 'manifest', 64 * 1024);
    const manifest = parseJsonRejectDuplicateKeys(manifestBytes.toString('utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error('manifest_must_be_json_object');
    }
    const operatorPublicKeyPem = readExternalFile(v['--operator-public-key'], 'operator_public_key', 16 * 1024).toString('utf8');
    const reviewerPublicKeyPem = readExternalFile(v['--reviewer-public-key'], 'reviewer_public_key', 16 * 1024).toString('utf8');
    const operatorSignature = readExternalFile(v['--operator-signature'], 'operator_signature', 64);
    const reviewerSignature = readExternalFile(v['--reviewer-signature'], 'reviewer_signature', 64);

    const result = verifyPinnedRestoreAttestation({
      manifest,
      operatorPublicKeyPem,
      reviewerPublicKeyPem,
      operatorSignature,
      reviewerSignature,
      expectedOperatorFingerprint: v['--expected-operator-public-key-sha256'],
      expectedReviewerFingerprint: v['--expected-reviewer-public-key-sha256']
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      status: 'NOT_VERIFIED',
      error: String(error && error.message || 'verification_failed').slice(0, 180),
      deployment_authorized: false
    }, null, 2) + '\n');
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { parseArgs, assertFingerprint, verifyPinnedRestoreAttestation, main };
