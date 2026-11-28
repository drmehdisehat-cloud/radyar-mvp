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

function snapshotEvidenceParents(file, label) {
  if (process.platform === 'win32') return [];
  const serviceUid = typeof process.geteuid === 'function' ? BigInt(process.geteuid()) : null;
  if (serviceUid === null) throw new Error(label + '_parent_ownership_cannot_be_verified');
  const absolute = path.resolve(file);
  const parsed = path.parse(absolute);
  const components = path.relative(parsed.root, path.dirname(absolute)).split(path.sep).filter(Boolean);
  let current = parsed.root;
  const snapshots = [];
  for (const component of components) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(current) !== current) {
      throw new Error(label + '_parent_must_be_a_canonical_real_directory');
    }
    const rootOwned = stat.uid === 0n;
    if (!rootOwned && stat.uid !== serviceUid) {
      throw new Error(label + '_parent_must_be_root_or_service_owned');
    }
    const mode = stat.mode & 0o7777n;
    if ((mode & 0o6000n) !== 0n) {
      throw new Error(label + '_parent_has_setuid_or_setgid_bits');
    }
    if ((mode & 0o022n) !== 0n && !(rootOwned && (mode & 0o1000n) !== 0n)) {
      throw new Error(label + '_parent_must_not_be_group_or_world_writable');
    }
    // A root-owned sticky shared temporary directory (for example /tmp)
    // may legitimately gain unrelated entries while parallel tests run.
    // Its owner/sticky protection and inode remain pinned; private descendants
    // still have their timestamps pinned to detect replacement during reads.
    const sharedSticky = rootOwned && (mode & 0o1000n) !== 0n;
    snapshots.push(Object.freeze({
      path: current,
      dev: stat.dev,
      ino: stat.ino,
      uid: stat.uid,
      mode: stat.mode,
      sharedSticky,
      mtimeNs: stat.mtimeNs,
      ctimeNs: stat.ctimeNs
    }));
  }
  return snapshots;
}

function assertEvidenceParentsUnchanged(snapshots, label) {
  for (const snapshot of snapshots) {
    const current = fs.lstatSync(snapshot.path, { bigint: true });
    if (current.isSymbolicLink() || !current.isDirectory() ||
        current.dev !== snapshot.dev || current.ino !== snapshot.ino ||
        current.uid !== snapshot.uid || current.mode !== snapshot.mode ||
        (!snapshot.sharedSticky &&
          (current.mtimeNs !== snapshot.mtimeNs || current.ctimeNs !== snapshot.ctimeNs)) ||
        fs.realpathSync(snapshot.path) !== snapshot.path) {
      throw new Error(label + '_parent_directory_changed_during_read');
    }
  }
}

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

function assertExternalEvidencePermissions(stat, label) {
  if (process.platform === 'win32') return;
  const serviceUid = typeof process.geteuid === 'function' ? BigInt(process.geteuid()) : null;
  if (serviceUid === null || (stat.uid !== 0n && stat.uid !== serviceUid)) {
    throw new Error(label + '_must_be_owned_by_root_or_service_user');
  }
  const mode = stat.mode & 0o7777n;
  if ((mode & 0o7000n) !== 0n) throw new Error(label + '_special_permission_bits_forbidden');
  if ((mode & 0o022n) !== 0n) throw new Error(label + '_must_not_be_group_or_world_writable');
  if ((mode & 0o400n) === 0n) throw new Error(label + '_must_be_owner_readable');
  if (label === 'manifest' && (mode & 0o077n) !== 0n) {
    throw new Error(label + '_must_be_owner_only');
  }
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
  // Evidence is only as trustworthy as the directories used to reach it.
  // Require root/service-owned parents, reject writable or special-bit parents
  // (except root-owned sticky shared temp directories), and pin their identity
  // and metadata across the descriptor read to detect path replacement.
  const parentSnapshots = snapshotEvidenceParents(real, label);
  // Reject hard-link aliases as well as symlinks: an external pathname must not
  // expose the same inode as a file elsewhere (including inside this checkout).
  if (!Number.isInteger(fs.constants.O_NOFOLLOW)) throw new Error(label + '_nofollow_open_unavailable');
  const fd = fs.openSync(real, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error(label + '_must_be_regular_file');
    if (before.nlink !== 1n) throw new Error(label + '_must_not_have_hard_link_aliases');
    assertExternalEvidencePermissions(before, label);
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
    assertEvidenceParentsUnchanged(parentSnapshots, label);
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
      'The manifest must be owner-only on POSIX; public keys and signatures must be root/service-owned and not group/world-writable.',
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
