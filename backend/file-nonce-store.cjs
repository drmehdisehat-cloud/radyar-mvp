'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function validateNonce(nonce) {
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(nonce)) {
    throw new TypeError('Nonce must be 16 random bytes encoded as canonical base64url.');
  }
  const decoded = Buffer.from(nonce, 'base64url');
  if (decoded.length !== 16 || decoded.toString('base64url') !== nonce) {
    throw new TypeError('Nonce must be 16 random bytes encoded as canonical base64url.');
  }
}

async function createFileNonceStore({ directory, publicRoot } = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) ||
      typeof publicRoot !== 'string' || !path.isAbsolute(publicRoot)) {
    throw new TypeError('Absolute private directory and publicRoot paths are required.');
  }

  const requestedDirectory = path.resolve(directory);
  const requestedPublicRoot = path.resolve(publicRoot);
  if (isInside(requestedPublicRoot, requestedDirectory)) {
    throw new Error('Nonce storage must be outside the public web root.');
  }

  const publicRootStat = await fs.lstat(requestedPublicRoot);
  if (publicRootStat.isSymbolicLink() || !publicRootStat.isDirectory()) {
    throw new Error('Public web root must be an existing, non-symlink directory.');
  }
  const realPublicRoot = await fs.realpath(requestedPublicRoot);

  await fs.mkdir(requestedDirectory, { recursive: true, mode: 0o700 });
  const directoryStat = await fs.lstat(requestedDirectory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error('Nonce storage must be a real directory, not a symlink.');
  }
  const realDirectory = await fs.realpath(requestedDirectory);
  if (isInside(realPublicRoot, realDirectory)) {
    throw new Error('Resolved nonce storage must be outside the public web root.');
  }
  if ((directoryStat.mode & 0o077) !== 0) {
    throw new Error('Nonce storage directory permissions must not grant group or other access.');
  }
  if (typeof process.getuid === 'function' && directoryStat.uid !== process.getuid()) {
    throw new Error('Nonce storage directory must be owned by the current service user.');
  }

  return Object.freeze({
    async consume(nonce, expiresAt) {
      validateNonce(nonce);
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
        throw new TypeError('Nonce expiry must be a future Unix timestamp in milliseconds.');
      }

      const filePath = path.join(realDirectory, nonce + '.used');
      let file;
      try {
        // O_EXCL semantics make concurrent attempts for the same nonce atomic
        // on the same local filesystem. Never overwrite an existing marker.
        file = await fs.open(filePath, 'wx', 0o600);
      } catch (error) {
        if (error && error.code === 'EEXIST') return false;
        throw error;
      }

      // If any write or sync step fails, leave the marker in place. That can
      // deny a legitimate retry, but it cannot silently re-enable a replay.
      try {
        await file.writeFile(JSON.stringify({
          schema: 'dadyar-used-review-nonce-v1',
          expiresAt
        }) + '\n', { encoding: 'utf8' });
        await file.sync();
      } finally {
        await file.close();
      }

      // Persist the directory entry as well as the marker contents. If this
      // fails, the caller receives an error and the verifier must fail closed.
      const directoryHandle = await fs.open(realDirectory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
      return true;
    }
  });
}

module.exports = { createFileNonceStore, validateNonce };
