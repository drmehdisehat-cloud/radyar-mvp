'use strict';
// Read-only post-copy verification for the explicitly requested public subpath.
// Run only after the isolated restore/release gates and owner authorization pass.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  const digest = crypto.createHash('sha1');
  digest.update(`blob ${bytes.length}\\0`);
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
  assert.ok(typeof expectedSourceBlobSha === 'string' &&
    /^[a-f0-9]{40}$/i.test(expectedSourceBlobSha) && !/^0{40}$/i.test(expectedSourceBlobSha),
    'expected reviewed source Git blob SHA-1 required');
  for (const [value, label] of [[source, 'source'], [destination, 'destination'], [productionDocumentRoot, 'production document root']]) {
    assert.ok(typeof value === 'string' && path.isAbsolute(value), label + ' must be an absolute path');
    assertNoSymlinkComponents(value, label);
  }

  const src = fs.realpathSync(source);
  const root = fs.realpathSync(productionDocumentRoot);
  const previewDirectory = path.join(root, 'dadyar-preview');
  const expectedDestination = path.join(previewDirectory, 'index.html');
  assert.ok(fs.statSync(root).isDirectory(), 'production document root must be a directory');
  assert.equal(path.resolve(destination), expectedDestination,
    'public destination must be exactly DOCUMENT_ROOT/dadyar-preview/index.html');
  assert.equal(fs.realpathSync(destination), expectedDestination,
    'public destination must resolve to the dedicated preview file');
  assertNoSymlinkComponents(previewDirectory, 'preview directory');
  assert.equal(fs.realpathSync(previewDirectory), previewDirectory,
    'preview directory must not resolve through an alias');
  assert.ok(fs.statSync(previewDirectory).isDirectory(), 'preview directory must be a directory');

  const entries = fs.readdirSync(previewDirectory).sort();
  assert.deepEqual(entries, ['index.html'],
    'dedicated preview directory must contain only index.html; no .htaccess or extra files');
  assert.ok(isOutside(root, src), 'reviewed source must remain outside production document root');
  assert.ok(fs.statSync(src).isFile(), 'source must be a regular file');
  assert.ok(fs.statSync(expectedDestination).isFile(), 'public destination must be a regular file');
  const srcStat = fs.statSync(src);
  const dstStat = fs.statSync(expectedDestination);
  assert.ok(srcStat.dev !== dstStat.dev || srcStat.ino !== dstStat.ino,
    'public destination must not be a hard link to source');
  assert.equal(path.basename(src), 'index.html', 'source must be index.html');

  const sourceBlobSha = gitBlobSha(src);
  assert.equal(sourceBlobSha.toLowerCase(), expectedSourceBlobSha.toLowerCase(),
    'source differs from pinned reviewed Git blob');
  const sourceHash = sha256(src);
  const destinationHash = sha256(expectedDestination);
  assert.equal(destinationHash, sourceHash, 'public destination differs from reviewed source');

  const html = fs.readFileSync(expectedDestination, 'utf8');
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
    source_sha256: sourceHash,
    destination_sha256: destinationHash,
    destination_realpath: expectedDestination,
    preview_directory_realpath: previewDirectory,
    preview_directory_entries: entries,
    production_document_root_realpath: root
  };
}

if (require.main === module) {
  const [source, destination, productionDocumentRoot, expectedSourceBlobSha] = process.argv.slice(2);
  if (!source || !destination || !productionDocumentRoot || !expectedSourceBlobSha) {
    console.error('Usage: node scripts/verify-public-preview-subpath.cjs SOURCE/index.html DOCUMENT_ROOT/dadyar-preview/index.html PRODUCTION_DOCUMENT_ROOT EXPECTED_SOURCE_GIT_BLOB_SHA1');
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(verifyPublicPreviewSubpath(source, destination, productionDocumentRoot, expectedSourceBlobSha)));
    } catch (error) {
      console.error('NOT_VERIFIED:', error.message);
      process.exitCode = 1;
    }
  }
}
module.exports = { verifyPublicPreviewSubpath };
