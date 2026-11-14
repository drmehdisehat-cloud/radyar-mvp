'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyPublicPreviewSubpath } = require('../scripts/verify-public-preview-subpath.cjs');

function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  const digest = crypto.createHash('sha1');
  digest.update('blob ' + bytes.length + String.fromCharCode(0));
  digest.update(bytes);
  return digest.digest('hex');
}
function sandbox(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-public-preview-'));
  try {
    const sourceDir = path.join(root, 'reviewed-source');
    const documentRoot = path.join(root, 'public_html');
    const previewDirectory = path.join(documentRoot, 'dadyar-preview');
    fs.mkdirSync(sourceDir);
    fs.mkdirSync(documentRoot);
    fs.mkdirSync(previewDirectory);
    const source = path.join(sourceDir, 'index.html');
    const destination = path.join(previewDirectory, 'index.html');
    fs.copyFileSync(path.resolve(__dirname, '../dadyar-preview/index.html'), source);
    fs.copyFileSync(source, destination);
    return fn({ root, source, destination, documentRoot, previewDirectory, expectedBlob: gitBlobSha(source) });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('dedicated public /dadyar-preview/ file passes only with exact reviewed bytes', () => sandbox(({source,destination,documentRoot,previewDirectory,expectedBlob}) => {
  const result = verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob);
  assert.equal(result.matched, true);
  assert.equal(result.destination_mode, 'dedicated-public-subpath');
  assert.equal(result.destination_outside_document_root, false);
  assert.equal(result.destination_within_dedicated_preview_directory, true);
  assert.deepEqual(result.preview_directory_entries, ['index.html']);
  assert.equal(result.destination_realpath, destination);
  assert.equal(result.preview_directory_realpath, previewDirectory);
  assert.equal(result.production_document_root_realpath, documentRoot);
  assert.equal(result.source_blob_sha1, expectedBlob);
  assert.equal(result.source_sha256, result.destination_sha256);
}));

test('modified public preview bytes are rejected', () => sandbox(({source,destination,documentRoot,expectedBlob}) => {
  fs.appendFileSync(destination, '\n<!-- changed -->');
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob), /public destination differs/);
}));

test('extra files including .htaccess are rejected from the dedicated preview directory', () => sandbox(({source,destination,documentRoot,previewDirectory,expectedBlob}) => {
  fs.writeFileSync(path.join(previewDirectory, '.htaccess'), 'Options +Indexes');
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob), /only index.html/);
}));

test('symlinked public preview directory is rejected', () => sandbox(({root,source,destination,documentRoot,previewDirectory,expectedBlob}) => {
  const alternate = path.join(root, 'alternate-preview');
  fs.mkdirSync(alternate);
  fs.copyFileSync(source, path.join(alternate, 'index.html'));
  fs.rmSync(previewDirectory, { recursive: true });
  fs.symlinkSync(alternate, previewDirectory, 'dir');
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob), /symlinks/);
}));

test('symlinked public preview file is rejected', () => sandbox(({source,destination,documentRoot,expectedBlob}) => {
  fs.unlinkSync(destination);
  fs.symlinkSync(source, destination);
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob), /symlinks/);
}));

test('hard-linked public preview file is rejected', () => sandbox(({source,destination,documentRoot,expectedBlob}) => {
  fs.unlinkSync(destination);
  fs.linkSync(source, destination);
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob), /hard-link aliases|hard link/);
}));

test('hard-link alias outside the preview directory is rejected for the public destination', () => sandbox(({root,source,destination,documentRoot,expectedBlob}) => {
  fs.linkSync(destination, path.join(root, 'destination-alias.html'));
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob), /destination must not have hard-link aliases/);
}));

test('hard-link alias outside the reviewed source directory is rejected for the source', () => sandbox(({root,source,destination,documentRoot,expectedBlob}) => {
  fs.linkSync(source, path.join(root, 'source-alias.html'));
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob), /source must not have hard-link aliases/);
}));

test('empty reviewed source is rejected before hash comparison', () => sandbox(({source,destination,documentRoot,expectedBlob}) => {
  fs.writeFileSync(source, '');
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob), /source must not be empty/);
}));

test('empty public destination is rejected before hash comparison', () => sandbox(({source,destination,documentRoot,expectedBlob}) => {
  fs.writeFileSync(destination, '');
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, expectedBlob), /destination must not be empty/);
}));

test('wrong path and source inside document root are rejected', () => sandbox(({source,destination,documentRoot,expectedBlob}) => {
  const wrongDir = path.join(documentRoot, 'other');
  fs.mkdirSync(wrongDir);
  const wrongDestination = path.join(wrongDir, 'index.html');
  fs.copyFileSync(source, wrongDestination);
  assert.throws(() => verifyPublicPreviewSubpath(source, wrongDestination, documentRoot, expectedBlob), /exactly DOCUMENT_ROOT/);
  const inRootSource = path.join(documentRoot, 'source.html');
  fs.copyFileSync(source, inRootSource);
  assert.throws(() => verifyPublicPreviewSubpath(inRootSource, destination, documentRoot, gitBlobSha(inRootSource)), /outside production document root/);
}));

test('wrong reviewed Git blob pin is rejected', () => sandbox(({source,destination,documentRoot,expectedBlob}) => {
  const wrong = expectedBlob === 'f'.repeat(40) ? 'e'.repeat(40) : 'f'.repeat(40);
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, wrong), /source differs from pinned reviewed Git blob/);
}));

test('zero Git blob pin is rejected before destination verification', () => sandbox(({source,destination,documentRoot}) => {
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, '0'.repeat(40)), /expected reviewed source Git blob SHA-1 required/);
}));

test('public preview verifier rejects a source that permits indexing even when its Git pin matches', () => sandbox(({source,destination,documentRoot}) => {
  const html = fs.readFileSync(source, 'utf8').replace(
    '<meta name="robots" content="noindex,nofollow,noarchive">',
    '<meta name="robots" content="index,follow">'
  );
  fs.writeFileSync(source, html);
  fs.copyFileSync(source, destination);
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, gitBlobSha(source)),
    /opt out of indexing/);
}));

test('public preview verifier rejects a permissive referrer policy even when its Git pin matches', () => sandbox(({source,destination,documentRoot}) => {
  const html = fs.readFileSync(source, 'utf8').replace(
    '<meta name="referrer" content="no-referrer">',
    '<meta name="referrer" content="strict-origin">'
  );
  fs.writeFileSync(source, html);
  fs.copyFileSync(source, destination);
  assert.throws(() => verifyPublicPreviewSubpath(source, destination, documentRoot, gitBlobSha(source)),
    /suppress referrer disclosure/);
}));
