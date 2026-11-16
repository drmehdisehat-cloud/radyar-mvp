'use strict';
// Copy the reviewed offline preview into a NEW isolated staging root only.
// This is not a restore proof, production deployment, or release authorization.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');
const { verifyPreview } = require('./verify-preview-destination.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXPECTED_SOURCE = path.join(REPO_ROOT, 'dadyar-preview', 'index.html');
const MAX_PREVIEW_BYTES = 1024 * 1024;
const GIT_BLOB_SHA1 = /^[a-f0-9]{40}$/i;

function fail(message) { throw new Error(message); }
function rejectSymlinkComponents(target, label) {
  let current = path.resolve(target);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(label + ' path contains a symbolic link');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function canonicalDirectory(target, label, requirePrivate = false) {
  if (typeof target !== 'string' || !path.isAbsolute(target) || path.resolve(target) !== target) {
    fail(label + ' must be an absolute canonical path');
  }
  rejectSymlinkComponents(target, label);
  const real = fs.realpathSync(target);
  if (real !== target) fail(label + ' must not use a symlink alias');
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) fail(label + ' must be an existing directory');
  if (requirePrivate) {
    assertPrivateOwnedDirectory(stat, label);
  }
  return { realpath: real, stat };
}
function assertPrivateOwnedDirectory(stat, label, expectedUid = (typeof process.getuid === 'function' ? process.getuid() : null)) {
  if (!stat || !Number.isInteger(stat.mode)) {
    fail(label + ' permissions could not be verified');
  }
  if ((stat.mode & 0o022) !== 0) {
    fail(label + ' must not be group- or world-writable');
  }
  if (expectedUid !== null && (!Number.isInteger(stat.uid) || stat.uid !== expectedUid)) {
    fail(label + ' must be owned by the current service user');
  }
}

function isOutside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}
function pathsDisjoint(first, second) {
  return isOutside(first, second) && isOutside(second, first);
}
function gitBlobSha1(bytes) {
  const digest = crypto.createHash('sha1');
  digest.update('blob ' + bytes.length + String.fromCharCode(0));
  digest.update(bytes);
  return digest.digest('hex');
}
function assertAbsent(target, label) {
  try {
    fs.lstatSync(target);
    fail(label + ' already exists; refusing overwrite');
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }
}
function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = fs.writeSync(fd, bytes, offset, bytes.length - offset, null);
    if (!Number.isInteger(written) || written <= 0) fail('staging file write did not make progress');
    offset += written;
  }
}
function syncDirectory(directory) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0) | fs.constants.O_NOFOLLOW;
  const fd = fs.openSync(directory, flags);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function stagePreviewIsolated({ source, stagingRoot, productionDocumentRoot, expectedSourceBlobSha1 } = {}) {
  if (typeof expectedSourceBlobSha1 !== 'string' || !GIT_BLOB_SHA1.test(expectedSourceBlobSha1) ||
      /^0{40}$/i.test(expectedSourceBlobSha1)) {
    fail('a non-zero reviewed source Git blob SHA-1 is required');
  }
  if (typeof source !== 'string' || !path.isAbsolute(source) || path.resolve(source) !== source) {
    fail('source must be an absolute canonical path');
  }
  rejectSymlinkComponents(source, 'source');
  if (source !== EXPECTED_SOURCE || fs.realpathSync(source) !== EXPECTED_SOURCE) {
    fail('source must be the reviewed dadyar-preview/index.html in this checkout');
  }

  const root = canonicalDirectory(stagingRoot, 'isolated staging root', true);
  const production = canonicalDirectory(productionDocumentRoot, 'production document root');
  const checkout = canonicalDirectory(REPO_ROOT, 'Git checkout');
  if (!pathsDisjoint(root.realpath, production.realpath)) {
    fail('isolated staging root must be disjoint from production document root in both directions');
  }
  if (!pathsDisjoint(root.realpath, checkout.realpath)) {
    fail('isolated staging root must be disjoint from Git checkout in both directions');
  }

  const sourceRead = readStableRegularFile(source, 'reviewed preview source', {
    includeBytes: true,
    maxBytes: MAX_PREVIEW_BYTES
  });
  const sourceBlobSha1 = gitBlobSha1(sourceRead.bytes);
  if (sourceBlobSha1.toLowerCase() !== expectedSourceBlobSha1.toLowerCase()) {
    fail('source differs from the pinned reviewed Git blob');
  }

  const destinationDirectory = path.join(root.realpath, 'dadyar-preview');
  const destinationFile = path.join(destinationDirectory, 'index.html');
  assertAbsent(destinationDirectory, 'staging dadyar-preview directory');

  // mkdir is deliberately non-recursive and exclusive. The caller must prepare
  // and protect the isolated root; this function never creates or edits its parents.
  fs.mkdirSync(destinationDirectory, { mode: 0o755 });
  const createdDirectory = fs.lstatSync(destinationDirectory);
  if (!createdDirectory.isDirectory() || createdDirectory.isSymbolicLink() ||
      fs.realpathSync(destinationDirectory) !== destinationDirectory ||
      (createdDirectory.mode & 0o022) !== 0) {
    fail('new staging directory failed its canonical/private-directory check');
  }

  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== 'number') fail('O_NOFOLLOW support is required');
  const fd = fs.openSync(destinationFile,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
    0o644);
  try {
    writeAll(fd, sourceRead.bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  syncDirectory(destinationDirectory);

  const afterDirectory = fs.lstatSync(destinationDirectory);
  if (!afterDirectory.isDirectory() || afterDirectory.isSymbolicLink() ||
      afterDirectory.dev !== createdDirectory.dev || afterDirectory.ino !== createdDirectory.ino ||
      fs.realpathSync(destinationDirectory) !== destinationDirectory) {
    fail('staging directory changed during copy');
  }

  const verified = verifyPreview(source, destinationFile, production.realpath, expectedSourceBlobSha1);
  const entries = fs.readdirSync(destinationDirectory);
  if (entries.length !== 1 || entries[0] !== 'index.html') {
    fail('staging directory must contain exactly one index.html file');
  }

  return Object.freeze({
    status: 'ISOLATED_STAGING_COPY_VERIFIED_NOT_DEPLOYED',
    staging_root: root.realpath,
    destination_realpath: verified.destination_realpath,
    source_blob_sha1: verified.source_blob_sha1,
    source_sha256: verified.source_sha256,
    destination_sha256: verified.destination_sha256,
    files: Object.freeze(['index.html']),
    production_document_root_untouched: true,
    git_checkout_untouched: true,
    deployment_authorized: false,
    restore_proven: false
  });
}

if (require.main === module) {
  const [source, stagingRoot, productionDocumentRoot, expectedSourceBlobSha1] = process.argv.slice(2);
  if (![source, stagingRoot, productionDocumentRoot, expectedSourceBlobSha1].every(Boolean)) {
    process.stderr.write('Usage: node scripts/stage-preview-isolated.cjs SOURCE/index.html ISOLATED_STAGING_ROOT PRODUCTION_DOCUMENT_ROOT EXPECTED_REVIEWED_GIT_BLOB_SHA1\\n');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(stagePreviewIsolated({
        source, stagingRoot, productionDocumentRoot, expectedSourceBlobSha1
      }), null, 2) + '\\n');
    } catch (error) {
      process.stderr.write('STAGING_REFUSED: ' + String(error.message || 'verification_failed') + '\\n');
      process.exitCode = 1;
    }
  }
}
module.exports = { stagePreviewIsolated, pathsDisjoint, assertPrivateOwnedDirectory };
