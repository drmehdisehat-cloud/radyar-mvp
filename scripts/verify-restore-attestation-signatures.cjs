'use strict';
// Verifies two Ed25519 signatures over a canonical restore manifest.
// Valid signatures do NOT prove a real restore, signer identity, or release approval.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { hasIndependentRestoreAttestation } = require('./decide-preview-release.cjs');
const { parseJsonRejectDuplicateKeys } = require('./strict-json.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_PUBLIC_KEY_BYTES = 16 * 1024;
const SIGNATURE_BYTES = 64;

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(label + '_is_not_valid_utf8');
  }
}

function canonicalizeManifest(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('manifest_contains_non_finite_number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalizeManifest).join(',') + ']';
  const prototype = value && typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
  if (prototype !== Object.prototype && prototype !== null) throw new Error('manifest_contains_non_json_value');
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('manifest_contains_forbidden_key');
  }
  return '{' + keys.map(key => JSON.stringify(key) + ':' + canonicalizeManifest(value[key])).join(',') + '}';
}

function loadEd25519PublicKey(pem, label) {
  let key;
  try { key = crypto.createPublicKey(pem); } catch { throw new Error(label + '_public_key_invalid'); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(label + '_public_key_must_be_ed25519');
  const der = key.export({ type: 'spki', format: 'der' });
  return { key, fingerprint: crypto.createHash('sha256').update(der).digest('hex') };
}

function verifyRestoreAttestationSignatures({ manifest, operatorPublicKeyPem, reviewerPublicKeyPem, operatorSignature, reviewerSignature } = {}) {
  if (!hasIndependentRestoreAttestation(manifest)) throw new Error('restore_manifest_schema_or_consistency_invalid');
  if (!Buffer.isBuffer(operatorSignature) || operatorSignature.length !== SIGNATURE_BYTES ||
      !Buffer.isBuffer(reviewerSignature) || reviewerSignature.length !== SIGNATURE_BYTES) {
    throw new Error('both_ed25519_signatures_must_be_exactly_64_bytes');
  }
  const operator = loadEd25519PublicKey(operatorPublicKeyPem, 'operator');
  const reviewer = loadEd25519PublicKey(reviewerPublicKeyPem, 'reviewer');
  if (operator.fingerprint === reviewer.fingerprint) throw new Error('operator_and_reviewer_keys_must_be_distinct');
  const canonical = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  if (!crypto.verify(null, canonical, operator.key, operatorSignature)) throw new Error('operator_signature_invalid');
  if (!crypto.verify(null, canonical, reviewer.key, reviewerSignature)) throw new Error('reviewer_signature_invalid');
  return Object.freeze({
    status: 'SIGNATURES_VERIFIED_UNTRUSTED_KEY_IDENTITY',
    signature_verified: true,
    manifest_sha256: crypto.createHash('sha256').update(canonical).digest('hex'),
    operator_public_key_sha256: operator.fingerprint,
    reviewer_public_key_sha256: reviewer.fingerprint,
    restore_operation_independently_verified: false,
    deployment_authorized: false
  });
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function readExternalFile(file, label, maxBytes) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error(label + '_must_be_absolute');
  let current = path.resolve(file);
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(label + '_path_contains_symlink');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const real = fs.realpathSync(file);
  if (isInside(REPO_ROOT, real)) throw new Error(label + '_must_be_outside_git_checkout');
  // Reject hard-link aliases as well as symlinks: an external pathname must not
  // expose the same inode as a file elsewhere (including inside this checkout).
  if (!Number.isInteger(fs.constants.O_NOFOLLOW)) throw new Error(label + '_nofollow_open_unavailable');
  // O_NONBLOCK prevents a path swapped to a FIFO between validation and open from
  // hanging the release preflight. It is inert for regular files; fstat below
  // still rejects every non-regular evidence path.
  const openFlags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | (fs.constants.O_NONBLOCK || 0);
  const fd = fs.openSync(real, openFlags);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error(label + '_must_be_regular_file');
    if (before.nlink !== 1n) throw new Error(label + '_must_not_have_hard_link_aliases');
    if (before.size === 0n || before.size > BigInt(maxBytes)) throw new Error(label + '_size_invalid');
    const pathStat = fs.statSync(real, { bigint: true });
    if (pathStat.dev !== before.dev || pathStat.ino !== before.ino) {
      throw new Error(label + '_changed_during_open');
    }
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino ||
        after.size !== before.size || after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs || BigInt(bytes.length) !== before.size) {
      throw new Error(label + '_changed_during_read');
    }
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function parseArgs(argv) {
  const values = Object.create(null);
  let canonicalize = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--canonicalize') {
      if (canonicalize) throw new Error('duplicate_argument:--canonicalize');
      canonicalize = true;
      continue;
    }
    if (!['--manifest', '--operator-public-key', '--operator-signature', '--reviewer-public-key', '--reviewer-signature'].includes(arg)) {
      throw new Error('unknown_argument:' + arg);
    }
    if (values[arg]) throw new Error('duplicate_argument:' + arg);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('missing_path:' + arg);
    values[arg] = value;
  }
  if (!values['--manifest']) throw new Error('manifest_required');
  if (canonicalize && Object.keys(values).length !== 1) throw new Error('canonicalize_accepts_only_manifest');
  if (!canonicalize && ['--operator-public-key', '--operator-signature', '--reviewer-public-key', '--reviewer-signature'].some(key => !values[key])) {
    throw new Error('both_signers_and_signatures_required');
  }
  return { canonicalize, values };
}

function main(argv) {
  let args;
  try { args = parseArgs(argv); }
  catch (error) {
    process.stdout.write(JSON.stringify({ status: 'NOT_VERIFIED', error: error.message, deployment_authorized: false }) + '\n');
    return 2;
  }
  if (args.help) {
    process.stdout.write([
      'Usage:',
      '  node scripts/verify-restore-attestation-signatures.cjs --canonicalize --manifest /secure/restore.json > /secure/restore.canonical.json',
      '  node scripts/verify-restore-attestation-signatures.cjs --manifest /secure/restore.json --operator-public-key /secure/operator.pub.pem --operator-signature /secure/operator.sig --reviewer-public-key /secure/reviewer.pub.pem --reviewer-signature /secure/reviewer.sig',
      'All evidence, public keys and signatures must be regular non-symlink files outside the Git checkout.',
      'A successful result verifies signatures only; it does not prove a restore or authorize deployment.'
    ].join('\n') + '\n');
    return 0;
  }
  try {
    const manifestBytes = readExternalFile(args.values['--manifest'], 'manifest', MAX_MANIFEST_BYTES);
    const manifest = parseJsonRejectDuplicateKeys(decodeUtf8(manifestBytes, 'manifest'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('manifest_must_be_json_object');
    if (args.canonicalize) {
      if (!hasIndependentRestoreAttestation(manifest)) throw new Error('restore_manifest_schema_or_consistency_invalid');
      process.stdout.write(canonicalizeManifest(manifest) + '\n');
      return 0;
    }
    const operatorPublicKeyPem = readExternalFile(args.values['--operator-public-key'], 'operator_public_key', MAX_PUBLIC_KEY_BYTES).toString('utf8');
    const operatorSignature = readExternalFile(args.values['--operator-signature'], 'operator_signature', SIGNATURE_BYTES);
    const reviewerPublicKeyPem = readExternalFile(args.values['--reviewer-public-key'], 'reviewer_public_key', MAX_PUBLIC_KEY_BYTES).toString('utf8');
    const reviewerSignature = readExternalFile(args.values['--reviewer-signature'], 'reviewer_signature', SIGNATURE_BYTES);
    process.stdout.write(JSON.stringify(verifyRestoreAttestationSignatures({
      manifest, operatorPublicKeyPem, reviewerPublicKeyPem, operatorSignature, reviewerSignature
    }), null, 2) + '\n');
    return 0;
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: 'NOT_VERIFIED', error: String(error && error.message || 'verification_failed').slice(0, 180), deployment_authorized: false }) + '\n');
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { canonicalizeManifest, verifyRestoreAttestationSignatures, readExternalFile, decodeUtf8, parseArgs, main };
