'use strict';
// Verify that external restore-evidence bytes match the hashes in a signed manifest.
// This proves byte integrity only. It does not prove a restore operation or signer identity.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { hasProviderBoundRestoreAttestation } = require('./decide-preview-release.cjs');
const { parseJsonRejectDuplicateKeys } = require('./strict-json.cjs');
const { readExternalFile } = require('./verify-restore-attestation-signatures.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAX_MANIFEST_BYTES = 64 * 1024;
const LIMITS = Object.freeze({
  archive: 1024 * 1024 * 1024,
  restored_marker: 1024 * 1024,
  restore_log: 32 * 1024 * 1024,
  database_probe: 1024 * 1024
});
const HASH_FIELDS = Object.freeze({
  archive: 'archive_sha256',
  restored_marker: 'restored_marker_sha256',
  restore_log: 'restore_log_sha256',
  database_probe: 'database_probe_sha256'
});
const ARGUMENTS = Object.freeze({
  '--manifest': 'manifest',
  '--archive': 'archive',
  '--restored-marker': 'restored_marker',
  '--restore-log': 'restore_log',
  '--database-probe': 'database_probe'
});

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function assertCanonicalDirectory(directory, label) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory) {
    throw new Error(label + '_path_must_be_absolute_canonical');
  }

  // Check every component, not only the leaf. A writable parent can otherwise
  // let another local account replace the restore target or production root
  // after its canonical path has been observed.
  const root = path.parse(directory).root;
  const chain = [root];
  let current = root;
  for (const component of directory.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    chain.push(current);
  }

  for (let index = 0; index < chain.length; index++) {
    const componentPath = chain[index];
    const componentLabel = index === chain.length - 1 ? label : label + '_ancestor';
    const stat = fs.lstatSync(componentPath, { bigint: true });
    if (stat.isSymbolicLink()) throw new Error(componentLabel + '_path_contains_symlink');
    if (!stat.isDirectory()) throw new Error(componentLabel + '_path_must_be_directory');

    if (process.platform !== 'win32') {
      const serviceUid = typeof process.geteuid === 'function' ? BigInt(process.geteuid()) : null;
      if (serviceUid === null || (stat.uid !== 0n && stat.uid !== serviceUid)) {
        throw new Error(componentLabel + '_must_be_owned_by_root_or_service_user');
      }
      const mode = stat.mode & 0o7777n;
      if ((mode & 0o6000n) !== 0n) {
        throw new Error(componentLabel + '_special_permission_bits_forbidden');
      }
      const writable = (mode & 0o022n) !== 0n;
      const stickyRootParent = index < chain.length - 1 &&
        stat.uid === 0n && (mode & 0o1000n) !== 0n && writable;
      if (writable && !stickyRootParent) {
        throw new Error(componentLabel + '_must_not_be_group_or_world_writable');
      }
      if ((mode & 0o1000n) !== 0n && !stickyRootParent) {
        throw new Error(componentLabel + '_special_permission_bits_forbidden');
      }
    }
  }

  const real = fs.realpathSync(directory);
  if (real !== directory) throw new Error(label + '_path_is_not_canonical');
  return real;
}

function sameFileVersion(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
    a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.nlink === b.nlink;
}

function assertEvidenceFilePermissions(stat, label, ownerOnly = false) {
  // The verifier depends on POSIX O_NOFOLLOW semantics. On POSIX hosts, keep
  // backup archives, restore logs, DB probes and manifests private to the owner.
  // A restored marker may be readable by the sandbox web server, but never writable
  // by group/other users. Special permission bits are never accepted.
  if (process.platform === 'win32') return;
  // The parent directory being trusted is not enough: an unrelated account
  // must not own a marker or evidence file that it can later rewrite.
  const serviceUid = typeof process.geteuid === 'function' ? BigInt(process.geteuid()) : null;
  if (serviceUid === null || (stat.uid !== 0n && stat.uid !== serviceUid)) {
    throw new Error(label + '_must_be_owned_by_root_or_service_user');
  }
  if ((stat.mode & 0o7000n) !== 0n) throw new Error(label + '_special_permission_bits_forbidden');
  if ((stat.mode & 0o022n) !== 0n) throw new Error(label + '_must_not_be_group_or_world_writable');
  if (ownerOnly && (stat.mode & 0o077n) !== 0n) throw new Error(label + '_must_be_owner_only');
}

function hashExternalEvidenceFile(file, label, maxBytes) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) {
    throw new Error(label + '_path_must_be_absolute_canonical');
  }
  const parentPath = path.dirname(file);
  const canonicalParent = assertCanonicalDirectory(parentPath, label + '_parent');
  const parentBefore = fs.statSync(canonicalParent, { bigint: true });
  const filePathStat = fs.lstatSync(file, { bigint: true });
  if (filePathStat.isSymbolicLink()) throw new Error(label + '_path_contains_symlink');
  if (!filePathStat.isFile()) throw new Error(label + '_must_be_regular_file');
  const real = fs.realpathSync(file);
  if (real !== file || path.dirname(real) !== canonicalParent) throw new Error(label + '_path_is_not_canonical');
  if (isInside(REPO_ROOT, real)) throw new Error(label + '_path_inside_git_checkout');
  if (!Number.isInteger(fs.constants.O_NOFOLLOW)) throw new Error(label + '_nofollow_open_unavailable');

  const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | (fs.constants.O_NONBLOCK || 0);
  const fd = fs.openSync(real, flags);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error(label + '_must_be_regular_file');
    if (before.nlink !== 1n) throw new Error(label + '_must_not_have_hard_link_aliases');
    assertEvidenceFilePermissions(before, label, label !== 'restored_marker');
    if (before.size === 0n || before.size > BigInt(maxBytes)) throw new Error(label + '_size_invalid');
    const pathBefore = fs.lstatSync(real, { bigint: true });
    if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) throw new Error(label + '_path_replaced_or_not_regular');
    if (!sameFileVersion(before, pathBefore)) throw new Error(label + '_changed_during_open');

    const hash = crypto.createHash('sha256');
    const chunks = label === 'database_probe' ? [] : null;
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0n;
    while (true) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += BigInt(count);
      if (total > BigInt(maxBytes) || total > before.size) throw new Error(label + '_size_changed_during_read');
      const part = buffer.subarray(0, count);
      hash.update(part);
      if (chunks) chunks.push(Buffer.from(part));
    }

    const after = fs.fstatSync(fd, { bigint: true });
    const pathAfter = fs.lstatSync(real, { bigint: true });
    if (pathAfter.isSymbolicLink() || !pathAfter.isFile()) throw new Error(label + '_path_replaced_or_not_regular');
    const parentAfter = fs.statSync(canonicalParent, { bigint: true });
    assertCanonicalDirectory(canonicalParent, label + '_parent_after');
    if (!sameFileVersion(parentBefore, parentAfter)) throw new Error(label + '_parent_changed_during_read');
    if (!sameFileVersion(before, after) || !sameFileVersion(before, pathAfter) || total !== before.size) {
      throw new Error(label + '_changed_during_read');
    }
    return Object.freeze({
      realpath: real,
      sha256: hash.digest('hex'),
      bytes: Number(total),
      identity: String(before.dev) + ':' + String(before.ino),
      content: chunks ? Buffer.concat(chunks) : undefined
    });
  } finally {
    fs.closeSync(fd);
  }
}


const DATABASE_PROBE_QUERY = "SELECT DATABASE(), SUBSTRING_INDEX(CURRENT_USER(), '@', 1), 1, VERSION()";
const DATABASE_IDENTIFIER = /^[A-Za-z0-9_][A-Za-z0-9_$-]{0,63}$/;

function validProbeUtc(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validateDatabaseProbe(bytes, manifest) {
  const probe = parseJsonRejectDuplicateKeys(decodeUtf8(bytes));
  if (!probe || typeof probe !== 'object' || Array.isArray(probe)) {
    throw new Error('database_probe_must_be_json_object');
  }
  const expectedKeys = [
    'schema', 'probe_ok', 'query', 'database_name', 'database_user',
    'connection_test_value', 'server_version', 'restore_target_id',
    'database_name_separation_verified', 'database_user_separation_verified',
    'observed_at_utc'
  ].sort();
  if (Object.keys(probe).sort().join('|') !== expectedKeys.join('|')) {
    throw new Error('database_probe_schema_keys_invalid');
  }
  if (probe.schema !== 'dadyar-isolated-db-probe-v1' ||
      probe.probe_ok !== true ||
      probe.query !== DATABASE_PROBE_QUERY ||
      probe.connection_test_value !== 1 ||
      probe.database_name_separation_verified !== true ||
      probe.database_user_separation_verified !== true) {
    throw new Error('database_probe_result_invalid');
  }
  if (!DATABASE_IDENTIFIER.test(probe.database_name || '') ||
      !DATABASE_IDENTIFIER.test(probe.database_user || '') ||
      probe.database_name !== manifest.restore_database_name ||
      probe.database_user !== manifest.restore_database_user ||
      probe.database_name === manifest.production_database_name ||
      probe.database_user === manifest.production_database_user ||
      probe.restore_target_id !== manifest.restore_target_id) {
    throw new Error('database_probe_identity_mismatch');
  }
  if (typeof probe.server_version !== 'string' ||
      probe.server_version.length < 1 || probe.server_version.length > 128 ||
      /[^\x20-\x7e]/.test(probe.server_version)) {
    throw new Error('database_probe_server_version_invalid');
  }
  if (!validProbeUtc(probe.observed_at_utc)) {
    throw new Error('database_probe_timestamp_invalid');
  }
  const observed = Date.parse(probe.observed_at_utc);
  if (observed < Date.parse(manifest.restore_completed_at) ||
      observed > Date.parse(manifest.reviewed_at)) {
    throw new Error('database_probe_timestamp_outside_restore_review_window');
  }
  return Object.freeze({
    database_name: probe.database_name,
    database_user: probe.database_user,
    restore_target_id: probe.restore_target_id,
    observed_at_utc: probe.observed_at_utc,
    server_version: probe.server_version
  });
}

function verifyRestoreEvidenceBundle({ manifest, archivePath, restoredMarkerPath, restoreLogPath, databaseProbePath } = {}) {
  if (!hasProviderBoundRestoreAttestation(manifest)) throw new Error('restore_manifest_schema_or_consistency_invalid');
  const supplied = {
    archive: archivePath,
    restored_marker: restoredMarkerPath,
    restore_log: restoreLogPath,
    database_probe: databaseProbePath
  };
  const restoreRoot = assertCanonicalDirectory(manifest.restore_target_realpath, 'restore_target');
  const productionRoot = assertCanonicalDirectory(manifest.production_document_root_realpath, 'production_document_root');
  const checkoutRoot = fs.realpathSync(REPO_ROOT);
  if (isInside(checkoutRoot, restoreRoot) || isInside(restoreRoot, checkoutRoot)) {
    throw new Error('restore_target_overlaps_git_checkout');
  }
  if (isInside(productionRoot, restoreRoot) || isInside(restoreRoot, productionRoot)) {
    throw new Error('restore_target_overlaps_production_document_root');
  }

  const seenPaths = new Set();
  const seenIdentities = new Set();
  const files = Object.create(null);
  let databaseProbeSchemaVerified = false;

  for (const [label, file] of Object.entries(supplied)) {
    const result = hashExternalEvidenceFile(file, label, LIMITS[label]);
    if (isInside(productionRoot, result.realpath)) {
      throw new Error(label + '_inside_production_document_root');
    }
    if (label === 'restored_marker' && !isInside(restoreRoot, result.realpath)) {
      throw new Error('restored_marker_outside_restore_target');
    }
    if (label !== 'restored_marker' && isInside(restoreRoot, result.realpath)) {
      throw new Error(label + '_inside_restore_target');
    }
    if (seenPaths.has(result.realpath) || seenIdentities.has(result.identity)) {
      throw new Error(label + '_must_be_a_distinct_evidence_file');
    }
    seenPaths.add(result.realpath);
    seenIdentities.add(result.identity);
    const expected = manifest[HASH_FIELDS[label]];
    if (result.sha256 !== expected.toLowerCase()) throw new Error(label + '_sha256_mismatch');
    if (label === 'archive' && result.bytes !== manifest.archive_size_bytes) {
      throw new Error('archive_size_bytes_mismatch');
    }
    if (label === 'database_probe') {
      validateDatabaseProbe(result.content, manifest);
      databaseProbeSchemaVerified = true;
    }
    files[label] = Object.freeze({ sha256: result.sha256, bytes: result.bytes });
  }

  return Object.freeze({
    status: 'EVIDENCE_BYTES_MATCH_MANIFEST_NOT_RESTORE_PROOF',
    matched: true,
    files: Object.freeze(files),
    database_probe_schema_verified: databaseProbeSchemaVerified,
    restore_operation_independently_verified: false,
    signer_identity_verified: false,
    deployment_authorized: false
  });
}

function decodeUtf8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('manifest_is_not_valid_utf8'); }
}

function parseArgs(argv) {
  const values = Object.create(null);
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (!Object.hasOwn(ARGUMENTS, argument)) throw new Error('unknown_argument:' + argument);
    if (values[argument]) throw new Error('duplicate_argument:' + argument);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error('missing_path:' + argument);
    values[argument] = value;
  }
  const required = Object.keys(ARGUMENTS);
  for (const key of required) if (!values[key]) throw new Error('required_argument_missing:' + key);
  return { values };
}

function main(argv) {
  let parsed;
  try { parsed = parseArgs(argv); }
  catch (error) {
    process.stdout.write(JSON.stringify({ status: 'NOT_VERIFIED', error: error.message, deployment_authorized: false }) + '\n');
    return 2;
  }
  if (parsed.help) {
    process.stdout.write([
      'Usage:',
      '  node scripts/verify-restore-evidence-bundle.cjs --manifest /secure/restore.json --archive /secure/backup.archive --restored-marker /secure/marker.txt --restore-log /secure/restore.log --database-probe /secure/database-probe.json',
      'All paths must be canonical absolute paths outside the Git checkout.',
      'A successful result verifies evidence-file bytes against manifest hashes only; it does not prove a restore or authorize deployment.'
    ].join('\n') + '\n');
    return 0;
  }
  try {
    const manifestPath = parsed.values['--manifest'];
    if (path.resolve(manifestPath) !== manifestPath || fs.realpathSync(manifestPath) !== manifestPath) {
      throw new Error('manifest_path_must_be_canonical');
    }
    const manifestParent = assertCanonicalDirectory(path.dirname(manifestPath), 'manifest_parent');
    const manifestParentBefore = fs.statSync(manifestParent, { bigint: true });
    const manifestStat = fs.lstatSync(manifestPath, { bigint: true });
    if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) throw new Error('manifest_must_be_regular_file');
    assertEvidenceFilePermissions(manifestStat, 'manifest', true);
    const manifestBytes = readExternalFile(manifestPath, 'manifest', MAX_MANIFEST_BYTES);
    const manifestParentAfter = fs.statSync(manifestParent, { bigint: true });
    assertCanonicalDirectory(manifestParent, 'manifest_parent_after');
    if (!sameFileVersion(manifestParentBefore, manifestParentAfter)) throw new Error('manifest_parent_changed_during_read');
    const manifest = parseJsonRejectDuplicateKeys(decodeUtf8(manifestBytes));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('manifest_must_be_json_object');
    const restoreRoot = assertCanonicalDirectory(manifest.restore_target_realpath, 'restore_target');
    const productionRoot = assertCanonicalDirectory(manifest.production_document_root_realpath, 'production_document_root');
    if (isInside(restoreRoot, manifestPath) || isInside(productionRoot, manifestPath)) {
      throw new Error('manifest_inside_protected_root');
    }
    const result = verifyRestoreEvidenceBundle({
      manifest,
      archivePath: parsed.values['--archive'],
      restoredMarkerPath: parsed.values['--restored-marker'],
      restoreLogPath: parsed.values['--restore-log'],
      databaseProbePath: parsed.values['--database-probe']
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      status: 'NOT_VERIFIED',
      error: String(error && error.message || 'verification_failed').slice(0, 180),
      restore_operation_independently_verified: false,
      deployment_authorized: false
    }, null, 2) + '\n');
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { LIMITS, assertEvidenceFilePermissions, hashExternalEvidenceFile, verifyRestoreEvidenceBundle, parseArgs, main };