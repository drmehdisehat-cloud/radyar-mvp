'use strict';
// Offline preview integrity preflight. The destination must remain outside the
// production document root until a separately approved deployment step.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');

function gitBlobSha(bytes) {
  const digest = crypto.createHash('sha1');
  digest.update('blob ' + bytes.length + String.fromCharCode(0));
  digest.update(bytes);
  return digest.digest('hex');
}
function assertNoSymlinkComponents(target, label) {
  let current = path.resolve(target);
  let leaf = true;
  while (true) {
    const message = leaf ? label + ' must not be a symbolic link' : label + ' parent must not be a symbolic link';
    assert.ok(!fs.lstatSync(current).isSymbolicLink(), message);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    leaf = false;
  }
}
function canonicalPath(target, label) {
  const absolute = path.resolve(target);
  const real = fs.realpathSync(absolute);
  assert.equal(real, absolute, label + ' path must be canonical and contain no symlink aliases');
  return real;
}
function isOutside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}
function verifyPreview(source, destination, productionDocumentRoot, expectedSourceBlobSha) {
  assert.ok(typeof expectedSourceBlobSha === 'string' && /^[a-f0-9]{40}$/i.test(expectedSourceBlobSha) && !/^0{40}$/i.test(expectedSourceBlobSha),
    'expected reviewed source Git blob SHA-1 required');
  assert.ok(typeof source === 'string' && path.isAbsolute(source),
    'source must be an absolute path');
  assert.ok(typeof destination === 'string' && path.isAbsolute(destination),
    'destination must be an absolute path');
  assert.ok(typeof productionDocumentRoot === 'string' && path.isAbsolute(productionDocumentRoot),
    'production document root must be an absolute path');
  assertNoSymlinkComponents(source, 'source');
  assertNoSymlinkComponents(destination, 'destination');
  assertNoSymlinkComponents(productionDocumentRoot, 'production document root');
  const src = canonicalPath(source, 'source');
  const dst = canonicalPath(destination, 'destination');
  const protectedRoot = canonicalPath(productionDocumentRoot, 'production document root');
  assert.ok(fs.statSync(protectedRoot).isDirectory(), 'production document root must be a directory');
  assert.ok(isOutside(protectedRoot, dst), 'destination must be outside production document root');
  assert.notEqual(dst, src, 'destination must be a distinct staged file');
  assert.equal(path.basename(src), 'index.html', 'source must be index.html');
  assert.equal(path.basename(dst), 'index.html', 'destination must be index.html');
  const sourcePathStat = fs.lstatSync(src, { bigint: true });
  const destinationPathStat = fs.lstatSync(dst, { bigint: true });
  assert.ok(sourcePathStat.dev !== destinationPathStat.dev || sourcePathStat.ino !== destinationPathStat.ino,
    'destination must not be a hard link to source; hard-link aliases are forbidden');

  // Stable descriptor reads reject symlinks, hard-link aliases, non-regular files,
  // and content/metadata changes during hashing. Destination remains outside web root.
  const sourceRead = readStableRegularFile(src, 'source', { includeBytes: true });
  const destinationRead = readStableRegularFile(dst, 'destination', { includeBytes: true });
  assert.ok(sourceRead.stat.dev !== destinationRead.stat.dev || sourceRead.stat.ino !== destinationRead.stat.ino,
    'destination must not be a hard link to source');
  const sourceBlobSha = gitBlobSha(sourceRead.bytes);
  assert.equal(sourceBlobSha.toLowerCase(), expectedSourceBlobSha.toLowerCase(),
    'source differs from pinned reviewed Git blob');
  assert.equal(destinationRead.sha256, sourceRead.sha256, 'destination differs from reviewed source');
  const html = destinationRead.bytes.toString('utf8');
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /id="export-ack"/);
  assert.match(html, /id="download" disabled/);
  return {
    source_blob_sha1: sourceBlobSha,
    expected_source_blob_sha1: expectedSourceBlobSha,
    source_sha256: sourceRead.sha256,
    destination_sha256: destinationRead.sha256,
    destination_realpath: dst,
    production_document_root_realpath: protectedRoot,
    destination_outside_document_root: true,
    matched: true
  };
}
if (require.main === module) {
  const [source, destination, productionDocumentRoot, expectedSourceBlobSha] = process.argv.slice(2);
  if (!source || !destination || !productionDocumentRoot || !expectedSourceBlobSha) {
    console.error('Usage: node scripts/verify-preview-destination.cjs SOURCE/index.html STAGING_DESTINATION/index.html PRODUCTION_DOCUMENT_ROOT EXPECTED_SOURCE_GIT_BLOB_SHA1');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(verifyPreview(source, destination, productionDocumentRoot, expectedSourceBlobSha))); }
    catch (error) { console.error('NOT_VERIFIED:', error.message); process.exitCode = 1; }
  }
}
module.exports = { verifyPreview };
