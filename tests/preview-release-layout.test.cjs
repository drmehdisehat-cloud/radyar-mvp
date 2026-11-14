'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyPreviewReleaseLayout } = require('../scripts/preview-release-layout.cjs');

const source = path.resolve(__dirname, '../dadyar-preview/index.html');
const sourceBytes = fs.readFileSync(source);
const sourceBlobSha = (() => {
  const hash = crypto.createHash('sha1');
  hash.update(Buffer.from('blob ' + sourceBytes.length + String.fromCharCode(0)));
  hash.update(sourceBytes);
  return hash.digest('hex');
})();

function sandbox(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-release-layout-'));
  const stagingRoot = path.join(root, 'staging');
  const productionRoot = path.join(root, 'production');
  fs.mkdirSync(stagingRoot);
  fs.mkdirSync(productionRoot);
  const previewDir = path.join(stagingRoot, 'dadyar-preview');
  fs.mkdirSync(previewDir);
  fs.copyFileSync(source, path.join(previewDir, 'index.html'));
  try {
    return run({ root, stagingRoot, productionRoot, previewDir });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('exact isolated staging layout passes without copying into production', () => sandbox(({ stagingRoot, productionRoot }) => {
  const result = verifyPreviewReleaseLayout({
    source, stagingRoot, productionDocumentRoot: productionRoot, expectedSourceBlobSha: sourceBlobSha
  });
  assert.equal(result.status, 'PREVIEW_LAYOUT_VERIFIED_NOT_DEPLOYED');
  assert.equal(result.intended_public_path, '/dadyar-preview/');
  assert.equal(result.production_target_absent, true);
  assert.equal(result.no_copy_or_deployment_performed, true);
  assert.equal(result.source_sha256, result.staged_destination_sha256);
  assert.equal(fs.existsSync(path.join(productionRoot, 'dadyar-preview')), false);
}));

test('additional staged files are rejected', () => sandbox(({ stagingRoot, productionRoot, previewDir }) => {
  fs.writeFileSync(path.join(previewDir, '.htaccess'), 'deny from all');
  assert.throws(() => verifyPreviewReleaseLayout({
    source, stagingRoot, productionDocumentRoot: productionRoot, expectedSourceBlobSha: sourceBlobSha
  }), /must contain only index\.html/);
}));

test('an existing production preview path is never overwritten', () => sandbox(({ stagingRoot, productionRoot }) => {
  fs.mkdirSync(path.join(productionRoot, 'dadyar-preview'));
  assert.throws(() => verifyPreviewReleaseLayout({
    source, stagingRoot, productionDocumentRoot: productionRoot, expectedSourceBlobSha: sourceBlobSha
  }), /already exists; refusing overwrite/);
}));

test('staging and production roots must not be nested', () => sandbox(({ root, productionRoot }) => {
  const nested = path.join(productionRoot, 'staging');
  fs.mkdirSync(nested);
  const previewDir = path.join(nested, 'dadyar-preview');
  fs.mkdirSync(previewDir);
  fs.copyFileSync(source, path.join(previewDir, 'index.html'));
  assert.throws(() => verifyPreviewReleaseLayout({
    source, stagingRoot: nested, productionDocumentRoot: productionRoot, expectedSourceBlobSha: sourceBlobSha
  }), /separate, non-nested trees/);
}));

test('staging root inside the Git checkout is rejected', () => {
  const inside = fs.mkdtempSync(path.join(path.resolve(__dirname, '..'), '.dadyar-release-layout-'));
  try {
    const previewDir = path.join(inside, 'dadyar-preview');
    fs.mkdirSync(previewDir);
    fs.copyFileSync(source, path.join(previewDir, 'index.html'));
    const productionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-production-root-'));
    try {
      assert.throws(() => verifyPreviewReleaseLayout({
        source, stagingRoot: inside, productionDocumentRoot: productionRoot, expectedSourceBlobSha: sourceBlobSha
      }), /outside Git checkout/);
    } finally { fs.rmSync(productionRoot, { recursive: true, force: true }); }
  } finally { fs.rmSync(inside, { recursive: true, force: true }); }
});

test('a symlinked staged preview directory is rejected', () => sandbox(({ root, stagingRoot, productionRoot, previewDir }) => {
  const realDirectory = path.join(root, 'real-preview');
  fs.renameSync(previewDir, realDirectory);
  fs.symlinkSync(realDirectory, path.join(stagingRoot, 'dadyar-preview'), 'dir');
  assert.throws(() => verifyPreviewReleaseLayout({
    source, stagingRoot, productionDocumentRoot: productionRoot, expectedSourceBlobSha: sourceBlobSha
  }), /symbolic link/);
}));

test('a modified staged file is rejected against the reviewed Git blob', () => sandbox(({ stagingRoot, productionRoot, previewDir }) => {
  fs.appendFileSync(path.join(previewDir, 'index.html'), '<!-- modified -->');
  assert.throws(() => verifyPreviewReleaseLayout({
    source, stagingRoot, productionDocumentRoot: productionRoot, expectedSourceBlobSha: sourceBlobSha
  }), /destination differs/);
}));
