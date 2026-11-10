'use strict';
// Offline preview integrity preflight. The destination must remain outside the
// production document root until a separately approved deployment step.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function assertNoSymlinkComponents(target, label) {
  let current = path.resolve(target);
  while (true) {
    assert.ok(!fs.lstatSync(current).isSymbolicLink(), label + ' path must not contain symlinks');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function isOutside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}
function verifyPreview(source, destination, productionDocumentRoot) {
  assert.ok(typeof productionDocumentRoot === 'string' && path.isAbsolute(productionDocumentRoot),
    'production document root must be an absolute path');
  assertNoSymlinkComponents(source, 'source');
  assertNoSymlinkComponents(destination, 'destination');
  assertNoSymlinkComponents(productionDocumentRoot, 'production document root');
  const src = fs.realpathSync(source);
  const dst = fs.realpathSync(destination);
  const protectedRoot = fs.realpathSync(productionDocumentRoot);
  assert.ok(fs.statSync(protectedRoot).isDirectory(), 'production document root must be a directory');
  assert.ok(isOutside(protectedRoot, dst), 'destination must be outside production document root');
  assert.notEqual(dst, src, 'destination must be a distinct staged file');
  assert.ok(fs.statSync(src).isFile(), 'source must be a regular file');
  assert.ok(fs.statSync(dst).isFile(), 'destination must be a regular file');
  const srcStat = fs.statSync(src), dstStat = fs.statSync(dst);
  assert.ok(srcStat.dev !== dstStat.dev || srcStat.ino !== dstStat.ino, 'destination must not be a hard link to source');
  assert.equal(path.basename(src), 'index.html', 'source must be index.html');
  assert.equal(path.basename(dst), 'index.html', 'destination must be index.html');
  const sourceHash = sha256(src), destinationHash = sha256(dst);
  assert.equal(destinationHash, sourceHash, 'destination differs from reviewed source');
  const html = fs.readFileSync(dst, 'utf8');
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /id="export-ack"/);
  assert.match(html, /id="download" disabled/);
  return { source_sha256: sourceHash, destination_sha256: destinationHash,
    destination_realpath: dst, production_document_root_realpath: protectedRoot,
    destination_outside_document_root: true, matched: true };
}
if (require.main === module) {
  const [source, destination, productionDocumentRoot] = process.argv.slice(2);
  if (!source || !destination || !productionDocumentRoot) {
    console.error('Usage: node scripts/verify-preview-destination.cjs SOURCE/index.html STAGING_DESTINATION/index.html PRODUCTION_DOCUMENT_ROOT');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(verifyPreview(source, destination, productionDocumentRoot))); }
    catch (error) { console.error('NOT_VERIFIED:', error.message); process.exitCode = 1; }
  }
}
module.exports = { verifyPreview };
