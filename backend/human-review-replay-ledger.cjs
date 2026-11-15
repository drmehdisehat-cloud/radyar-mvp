'use strict';
// Single-host, local-filesystem anti-replay prototype for signed review attestations.
// It is intentionally not wired to the HTTP server and is not a distributed ledger.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyHumanReviewAttestation } = require('../scripts/verify-human-review-attestation.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const PRIVATE_MODE_MASK = 0o077n;

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function pathsDisjoint(first, second) {
  return !isInside(first, second) && !isInside(second, first);
}

function assertNoSymlinkComponents(target) {
  let current = path.resolve(target);
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('ledger_path_contains_symlink');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function assertPrivateLedgerDirectory(target) {
  if (typeof target !== 'string' || !path.isAbsolute(target) || path.resolve(target) !== target) {
    throw new Error('ledger_directory_must_be_absolute_and_canonical');
  }
  assertNoSymlinkComponents(target);
  const real = fs.realpathSync(target);
  if (real !== target) throw new Error('ledger_directory_not_canonical');
  if (!pathsDisjoint(REPO_ROOT, real)) throw new Error('ledger_directory_must_be_disjoint_from_git_checkout');
  if (typeof process.getuid !== 'function') throw new Error('ledger_owner_check_unavailable');
  const stat = fs.statSync(real, { bigint: true });
  if (!stat.isDirectory()) throw new Error('ledger_path_must_be_directory');
  if (stat.uid !== BigInt(process.getuid())) throw new Error('ledger_directory_owner_mismatch');
  if ((stat.mode & PRIVATE_MODE_MASK) !== 0n) throw new Error('ledger_directory_permissions_invalid');
  if (!Number.isInteger(fs.constants.O_NOFOLLOW) || !Number.isInteger(fs.constants.O_DIRECTORY)) {
    throw new Error('required_no_follow_directory_flags_unavailable');
  }
  const dirFd = fs.openSync(real, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(dirFd, { bigint: true });
    if (!opened.isDirectory() || opened.dev !== stat.dev || opened.ino !== stat.ino) {
      throw new Error('ledger_directory_changed_during_open');
    }
  } catch (error) {
    fs.closeSync(dirFd);
    throw error;
  }
  return { real, dirFd, dev: stat.dev, ino: stat.ino, uid: stat.uid };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertDirectoryStillPinned(directory) {
  const current = fs.statSync(directory.real, { bigint: true });
  const opened = fs.fstatSync(directory.dirFd, { bigint: true });
  if (!current.isDirectory() || current.dev !== directory.dev || current.ino !== directory.ino ||
      opened.dev !== directory.dev || opened.ino !== directory.ino) {
    throw new Error('ledger_directory_identity_changed');
  }
}

function writeExclusiveMarker(directory, name, record) {
  assertDirectoryStillPinned(directory);
  const markerPath = path.join(directory.real, name);
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
  const fd = fs.openSync(markerPath, flags, 0o600);
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || opened.uid !== directory.uid ||
        (opened.mode & PRIVATE_MODE_MASK) !== 0n) throw new Error('ledger_marker_metadata_invalid');
    const pathStat = fs.lstatSync(markerPath, { bigint: true });
    if (pathStat.isSymbolicLink() || pathStat.dev !== opened.dev || pathStat.ino !== opened.ino) {
      throw new Error('ledger_marker_path_changed');
    }
    fs.writeFileSync(fd, Buffer.from(JSON.stringify(record) + '\n', 'utf8'));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  assertDirectoryStillPinned(directory);
}

function consumeHumanReviewAttestation({
  attestation,
  trustStore,
  expectedSourceCommit,
  expectedSourceBlobSha1,
  expectedArtifactSha256,
  ledgerDirectory,
  now = Date.now()
} = {}) {
  let verification;
  try {
    verification = verifyHumanReviewAttestation({
      attestation, trustStore, expectedSourceCommit,
      expectedSourceBlobSha1, expectedArtifactSha256, now
    });
  } catch {
    return Object.freeze({ consumed: false, reason: 'invalid_review_attestation' });
  }
  if (!verification.verified) {
    return Object.freeze({ consumed: false, reason: verification.reason || 'invalid_review_attestation' });
  }

  let directory;
  try {
    directory = assertPrivateLedgerDirectory(ledgerDirectory);
    const p = attestation.payload;
    const reviewIdHash = sha256(p.issuer + '\0' + p.review_id);
    const nonceHash = sha256(p.issuer + '\0' + p.nonce);
    const consumedAt = new Date(now).toISOString();
    const record = Object.freeze({
      schema: 'dadyar-human-review-consumption-v1',
      issuer_sha256: sha256(p.issuer),
      subject_sha256: sha256(p.subject),
      review_id_sha256: reviewIdHash,
      nonce_sha256: nonceHash,
      source_commit: verification.sourceCommit,
      artifact_sha256: verification.artifactSha256,
      consumed_at: consumedAt
    });
    // Two independent exclusive claims prevent both review_id and nonce reuse.
    // Stable ordering makes concurrent callers acquire claims in the same order.
    const claims = [
      'review-' + reviewIdHash + '.json',
      'nonce-' + nonceHash + '.json'
    ].sort();
    for (const name of claims) writeExclusiveMarker(directory, name, record);
    fs.fsyncSync(directory.dirFd);
    return Object.freeze({
      consumed: true,
      sourceCommit: verification.sourceCommit,
      artifactSha256: verification.artifactSha256,
      consumedAt
    });
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      return Object.freeze({ consumed: false, reason: 'review_attestation_replayed' });
    }
    const detail = typeof error?.message === 'string' ? error.message : 'ledger_write_failed';
    return Object.freeze({ consumed: false, reason: 'replay_ledger_unavailable', detail });
  } finally {
    if (directory?.dirFd !== undefined) {
      try { fs.closeSync(directory.dirFd); } catch {}
    }
  }
}

module.exports = { consumeHumanReviewAttestation, assertPrivateLedgerDirectory, pathsDisjoint };
