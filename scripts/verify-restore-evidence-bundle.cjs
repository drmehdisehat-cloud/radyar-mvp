'use strict';
// Verify that external restore-evidence bytes match the hashes in a signed manifest.
// This proves byte integrity only. It does not prove a restore operation or signer identity.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { hasIndependentRestoreAttestation } = require('./decide-preview-release.cjs');
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

function sameFileVersion(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
    a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.nlink === b.nlink;
}

function hashExternalEvidenceFile(file, label, maxBytes) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) {
    throw new Error(label + '_path_must_be_absolute_canonical');
  }
  let current = file;
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(label + '_path_contains_symlink');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const real = fs.realpathSync(file);
  if (real !== file) throw new Error(label + '_path_is_not_canonical');
  if (isInside(REPO_ROOT, real)) throw new Error(label + '_path_inside_git_checkout');
  if (!Number.isInteger(fs.constants.O_NOFOLLOW)) throw new Error(label + '_nofollow_open_unavailable');

  const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | (fs.constants.O_NONBLOCK || 0);
  const fd = fs.openSync(real, flags);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error(label + '_must_be_regular_file');
    if (before.nlink !== 1n) throw new Error(label + '_must_not_have_hard_link_aliases');
    if (before.size === 0n || before.size > BigInt(maxBytes)) throw new Error(label + '_size_invalid');
    const pathBefore = fs.statSync(real, { bigint: true });
    if (!sameFileVersion(before, pathBefore)) throw new Error(label + '_changed_during_open');

    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0n;
    while (true) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += BigInt(count);
      if (total > BigInt(maxBytes) || total > before.size) throw new Error(label + '_size_changed_during_read');
      hash.update(buffer.subarray(0, count));
    }

    const after = fs.fstatSync(fd, { bigint: true });
    const pathAfter = fs.statSync(real, { bigint: true });
    if (!sameFileVersion(before, after) || !sameFileVersion(before, pathAfter) || total !== before.size) {
      throw new Error(label + '_changed_during_read');
    }
    return Object.freeze({
      realpath: real,
      sha256: hash.digest('hex'),
      bytes: Number(total),
      identity: String(before.dev) + ':' + String(before.ino)
    });
  } finally {
    fs.closeSync(fd);
  }
}

function verifyRestoreEvidenceBundle({ manifest, archivePath, restoredMarkerPath, restoreLogPath, databaseProbePath } = {}) {
  if (!hasIndependentRestoreAttestation(manifest)) throw new Error('restore_manifest_schema_or_consistency_invalid');
  const supplied = {
    archive: archivePath,
    restored_marker: restoredMarkerPath,
    restore_log: restoreLogPath,
    database_probe: databaseProbePath
  };
  const seenPaths = new Set();
  const seenIdentities = new Set();
  const files = Object.create(null);

  for (const [label, file] of Object.entries(supplied)) {
    const result = hashExternalEvidenceFile(file, label, LIMITS[label]);
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
    files[label] = Object.freeze({ sha256: result.sha256, bytes: result.bytes });
  }

  return Object.freeze({
    status: 'EVIDENCE_BYTES_MATCH_MANIFEST_NOT_RESTORE_PROOF',
    matched: true,
    files: Object.freeze(files),
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
    const manifestBytes = readExternalFile(parsed.values['--manifest'], 'manifest', MAX_MANIFEST_BYTES);
    const manifest = parseJsonRejectDuplicateKeys(decodeUtf8(manifestBytes));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('manifest_must_be_json_object');
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
module.exports = { LIMITS, hashExternalEvidenceFile, verifyRestoreEvidenceBundle, parseArgs, main };
