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

function removeOwnedMarker(directory, marker) {
  assertDirectoryStillPinned(directory);
  const markerPath = path.join(directory.real, marker.name);
  let current;
  try { current = fs.lstatSync(markerPath, { bigint: true }); }
  catch (error) {
    if (error && error.code === 'ENOENT') return true;
    throw error;
  }
  if (current.isSymbolicLink() || !current.isFile() ||
      current.dev !== marker.dev || current.ino !== marker.ino ||
      current.uid !== marker.uid || current.nlink !== 1n ||
      (current.mode & PRIVATE_MODE_MASK) !== 0n) return false;
  fs.unlinkSync(markerPath);
  assertDirectoryStillPinned(directory);
  return true;
}

function writeExclusiveMarker(directory, name, record) {
  assertDirectoryStillPinned(directory);
  const markerPath = path.join(directory.real, name);
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT |
    fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
  let marker = null;
  try {
    const fd = fs.openSync(markerPath, flags, 0o600);
    try {
      const opened = fs.fstatSync(fd, { bigint: true });
      marker = { name, dev: opened.dev, ino: opened.ino, uid: opened.uid };
      if (!opened.isFile() || opened.nlink !== 1n || opened.uid !== directory.uid ||
          (opened.mode & PRIVATE_MODE_MASK) !== 0n) {
        throw new Error('ledger_marker_metadata_invalid');
      }
      const pathStat = fs.lstatSync(markerPath, { bigint: true });
      if (pathStat.isSymbolicLink() || pathStat.dev !== opened.dev ||
          pathStat.ino !== opened.ino) throw new Error('ledger_marker_path_changed');
      fs.writeFileSync(fd, Buffer.from(JSON.stringify(record) + '\n', 'utf8'));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    assertDirectoryStillPinned(directory);
    return marker;
  } catch (error) {
    if (marker) {
      try {
        if (!removeOwnedMarker(directory, marker)) error.rollbackFailed = true;
      } catch {
        error.rollbackFailed = true;
      }
    }
    throw error;
  }
}

function markerExists(directory, name) {
  try {
    fs.lstatSync(path.join(directory.real, name), { bigint: true });
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function releaseLedgerLock(directory, lock) {
  let released = false;
  try {
    const opened = fs.fstatSync(lock.fd, { bigint: true });
    const current = fs.lstatSync(lock.path, { bigint: true });
    if (!opened.isFile() || !current.isFile() || current.isSymbolicLink() ||
        opened.dev !== lock.dev || opened.ino !== lock.ino ||
        current.dev !== lock.dev || current.ino !== lock.ino ||
        opened.uid !== directory.uid || current.uid !== directory.uid ||
        opened.nlink !== 1n || current.nlink !== 1n ||
        (opened.mode & PRIVATE_MODE_MASK) !== 0n ||
        (current.mode & PRIVATE_MODE_MASK) !== 0n) {
      throw new Error('ledger_transaction_lock_identity_changed');
    }
    fs.unlinkSync(lock.path);
    fs.fsyncSync(directory.dirFd);
    released = true;
  } finally {
    try { fs.closeSync(lock.fd); } catch {}
  }
  return released;
}

function acquireLedgerLock(directory) {
  assertDirectoryStillPinned(directory);
  const lockPath = path.join(directory.real, '.transaction.lock');
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT |
    fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
  let fd;
  try {
    fd = fs.openSync(lockPath, flags, 0o600);
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      const busy = new Error('ledger_transaction_busy');
      busy.code = 'LEDGER_BUSY';
      throw busy;
    }
    throw error;
  }

  const opened = fs.fstatSync(fd, { bigint: true });
  const lock = { path: lockPath, fd, dev: opened.dev, ino: opened.ino };
  try {
    const current = fs.lstatSync(lockPath, { bigint: true });
    if (!opened.isFile() || !current.isFile() || current.isSymbolicLink() ||
        opened.nlink !== 1n || current.nlink !== 1n ||
        opened.uid !== directory.uid || current.uid !== directory.uid ||
        (opened.mode & PRIVATE_MODE_MASK) !== 0n ||
        (current.mode & PRIVATE_MODE_MASK) !== 0n ||
        opened.dev !== current.dev || opened.ino !== current.ino) {
      throw new Error('ledger_transaction_lock_metadata_invalid');
    }
    fs.writeFileSync(fd, Buffer.from(JSON.stringify({
      schema: 'dadyar-review-ledger-transaction-lock-v1',
      pid: process.pid,
      started_at: new Date().toISOString()
    }) + '\n', 'utf8'));
    fs.fsyncSync(fd);
    assertDirectoryStillPinned(directory);
    return lock;
  } catch (error) {
    // If initialization fails, leave the lock in place. This is deliberately
    // fail-closed: an operator must inspect and remove a stale lock out of band.
    try { fs.closeSync(fd); } catch {}
    throw error;
  }
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
  let lock;
  const createdMarkers = [];
  let keepLockForRecovery = false;
  let result;
  try {
    directory = assertPrivateLedgerDirectory(ledgerDirectory);
    lock = acquireLedgerLock(directory);
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
    const claims = [
      'review-' + reviewIdHash + '.json',
      'nonce-' + nonceHash + '.json'
    ].sort();

    // Serialize the two-key claim transaction. Preflight both keys before
    // writing either one, so a duplicate review_id cannot burn a fresh nonce.
    if (claims.some(name => markerExists(directory, name))) {
      result = Object.freeze({ consumed: false, reason: 'review_attestation_replayed' });
    } else {
      for (const name of claims) {
        createdMarkers.push(writeExclusiveMarker(directory, name, record));
      }
      fs.fsyncSync(directory.dirFd);
      result = Object.freeze({
        consumed: true,
        sourceCommit: verification.sourceCommit,
        artifactSha256: verification.artifactSha256,
        consumedAt
      });
    }
  } catch (error) {
    let rollbackOk = !error?.rollbackFailed;
    for (const marker of createdMarkers.slice().reverse()) {
      try {
        if (!removeOwnedMarker(directory, marker)) rollbackOk = false;
      } catch {
        rollbackOk = false;
      }
    }
    if (createdMarkers.length > 0 && rollbackOk) {
      try { fs.fsyncSync(directory.dirFd); }
      catch { rollbackOk = false; }
    }
    if (!rollbackOk && lock) keepLockForRecovery = true;

    if (error && error.code === 'LEDGER_BUSY') {
      result = Object.freeze({ consumed: false, reason: 'replay_ledger_busy' });
    } else if (error && error.code === 'EEXIST' && rollbackOk) {
      result = Object.freeze({ consumed: false, reason: 'review_attestation_replayed' });
    } else {
      const detail = typeof error?.message === 'string' ? error.message : 'ledger_write_failed';
      result = Object.freeze({ consumed: false, reason: 'replay_ledger_unavailable', detail });
    }
  } finally {
    if (lock) {
      if (keepLockForRecovery) {
        try { fs.closeSync(lock.fd); } catch {}
      } else {
        try {
          if (!releaseLedgerLock(directory, lock)) {
            result = Object.freeze({
              consumed: false, reason: 'replay_ledger_unavailable',
              detail: 'ledger_transaction_lock_release_failed'
            });
          }
        } catch {
          result = Object.freeze({
            consumed: false, reason: 'replay_ledger_unavailable',
            detail: 'ledger_transaction_lock_release_failed'
          });
        }
      }
    }
    if (directory?.dirFd !== undefined) {
      try { fs.closeSync(directory.dirFd); } catch {}
    }
  }
  return result || Object.freeze({ consumed: false, reason: 'replay_ledger_unavailable' });
}

module.exports = { consumeHumanReviewAttestation, assertPrivateLedgerDirectory, pathsDisjoint };
