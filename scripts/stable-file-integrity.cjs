'use strict';
// Stable, fail-closed hashing for small deployment files and large restore archives.
// The caller must also validate directory boundaries and canonical paths.
const fs = require('node:fs');
const crypto = require('node:crypto');

function sameSnapshot(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode &&
    a.size === b.size && a.nlink === b.nlink &&
    a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function readStableRegularFile(file, label = 'file', options = {}) {
  if (typeof file !== 'string' || !file) throw Error(label + ' path required');
  const absolute = require('node:path').resolve(file);
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== 'number') throw Error(label + ' requires O_NOFOLLOW support');
  const flags = fs.constants.O_RDONLY | noFollow | (fs.constants.O_NONBLOCK || 0);
  let fd;
  try {
    fd = fs.openSync(absolute, flags);
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw Error(label + ' must be a regular file');
    if (before.nlink !== 1n) throw Error(label + ' must not have hard-link aliases');
    if (before.size <= 0n) throw Error(label + ' must not be empty');

    const pathBefore = fs.lstatSync(absolute, { bigint: true });
    if (pathBefore.isSymbolicLink() || !pathBefore.isFile() || !sameSnapshot(before, pathBefore) ||
        fs.realpathSync(absolute) !== absolute) {
      throw Error(label + ' path changed before read');
    }

    const digest = crypto.createHash('sha256');
    const chunks = options.includeBytes ? [] : null;
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    let total = 0n;
    while (true) {
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      total += BigInt(count);
      if (total > before.size) throw Error(label + ' grew while being read');
      const part = chunk.subarray(0, count);
      digest.update(part);
      if (chunks) chunks.push(Buffer.from(part));
    }

    const after = fs.fstatSync(fd, { bigint: true });
    const pathAfter = fs.lstatSync(absolute, { bigint: true });
    if (total !== before.size || !sameSnapshot(before, after) ||
        !sameSnapshot(before, pathAfter) || pathAfter.isSymbolicLink() ||
        fs.realpathSync(absolute) !== absolute) {
      throw Error(label + ' changed while being read');
    }

    return {
      sha256: digest.digest('hex'),
      stat: before,
      bytes: chunks ? Buffer.concat(chunks) : undefined
    };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

module.exports = { readStableRegularFile };
