'use strict';
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
function verifyPublicPreviewSubpath(source, destination, productionDocumentRoot, expectedSourceBlobSha) {
  assert.ok(typeof expectedSourceBlobSha === 'string' && /^[a-f0-9]{40}$/i.test(expectedSourceBlobSha) && !/^0{40}$/i.test(expectedSourceBlobSha), 'expected reviewed source Git blob SHA-1 required');
  for (const [value, label] of [[source, 'source'], [destination, 'destination'], [productionDocumentRoot, 'production document root']]) {
    assert.ok(typeof value === 'string' && path.isAbsolute(value), label + ' must be an absolute path');
    assertNoSymlinkComponents(value, label);
  }
  const src = fs.realpathSync(source);
  const root = fs.realpathSync(productionDocumentRoot);
  const previewDirectory = path.join(root, 'dadyar-preview');
  const expectedDestination = path.join(previewDirectory, 'index.html');
  assert.ok(fs.statSync(root).isDirectory(), 'production document root must be a directory');
  assert.equal(path.resolve(destination), expectedDestination, 'public destination must be exactly DOCUMENT_ROOT/dadyar-preview/index.html');
  assert.equal(fs.realpathSync(destination), expectedDestination, 'public destination must resolve to the dedicated preview file');
  assertNoSymlinkComponents(previewDirectory, 'preview directory');
  assert.equal(fs.realpathSync(previewDirectory), previewDirectory, 'preview directory must not resolve through an alias');
  assert.ok(fs.statSync(previewDirectory).isDirectory(), 'preview directory must be a directory');
  const entries = fs.readdirSync(previewDirectory).sort();
  assert.deepEqual(entries, ['index.html'], 'dedicated preview directory must contain only index.html; no .htaccess or extra files');
  assert.ok(isOutside(root, src), 'reviewed source must remain outside production document root');
  assert.equal(path.basename(src), 'index.html', 'source must be index.html');

  // Hash both files through stable, no-follow descriptors. This rejects empty,
  // non-regular, symlinked or hard-linked files and detects metadata/content
  // changes during the read instead of relying on path-based readFileSync.
  const sourceRead = readStableRegularFile(src, 'source', { includeBytes: true });
  const destinationRead = readStableRegularFile(expectedDestination, 'destination', { includeBytes: true });
  const sourceBlobSha = gitBlobSha(sourceRead.bytes);
  assert.equal(sourceBlobSha.toLowerCase(), expectedSourceBlobSha.toLowerCase(), 'source differs from pinned reviewed Git blob');
  assert.equal(destinationRead.sha256, sourceRead.sha256, 'public destination differs from reviewed source');

  const html = destinationRead.bytes.toString('utf8');
  assert.match(html, /<meta\s+name="robots"\s+content="noindex,nofollow,noarchive"\s*\/?>/i,
    'public preview must opt out of indexing, following and archiving');
  assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"\s*\/?>/i,
    'public preview must suppress referrer disclosure');
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /id="export-ack"/);
  assert.match(html, /id="download" disabled/);
  return {
    matched: true,
    destination_mode: 'dedicated-public-subpath',
    destination_outside_document_root: false,
    destination_within_dedicated_preview_directory: true,
    source_blob_sha1: sourceBlobSha,
    expected_source_blob_sha1: expectedSourceBlobSha,
    source_sha256: sourceRead.sha256,
    destination_sha256: destinationRead.sha256,
    destination_realpath: expectedDestination,
    preview_directory_realpath: previewDirectory,
    preview_directory_entries: entries,
    production_document_root_realpath: root
  };
}
if (require.main === module) {
  const [source, destination, productionDocumentRoot, expectedSourceBlobSha] = process.argv.slice(2);
  if (![source, destination, productionDocumentRoot, expectedSourceBlobSha].every(Boolean)) {
    console.error('Usage: node scripts/verify-public-preview-subpath.cjs SOURCE/index.html DOCUMENT_ROOT/dadyar-preview/index.html PRODUCTION_DOCUMENT_ROOT EXPECTED_SOURCE_GIT_BLOB_SHA1');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(verifyPublicPreviewSubpath(source, destination, productionDocumentRoot, expectedSourceBlobSha))); }
    catch (error) { console.error('NOT_VERIFIED:', error.message); process.exitCode = 1; }
  }
}
module.exports = { verifyPublicPreviewSubpath };
