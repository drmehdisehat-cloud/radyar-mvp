'use strict';
// Validate the exact static-preview release layout without copying or publishing files.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { verifyPreview } = require('./verify-preview-destination.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');

function isOutside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}

function assertNoSymlinkComponents(target, label) {
  let current = path.resolve(target);
  while (true) {
    const stat = fs.lstatSync(current);
    assert.ok(!stat.isSymbolicLink(), label + ' path contains a symbolic link');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function canonicalDirectory(target, label) {
  assert.equal(target, path.resolve(target), label + ' must be an absolute canonical path');
  assertNoSymlinkComponents(target, label);
  assert.equal(fs.realpathSync(target), target, label + ' must not contain path aliases');
  assert.ok(fs.statSync(target).isDirectory(), label + ' must be a directory');
  return target;
}

function verifyPreviewReleaseLayout({ source, stagingRoot, productionDocumentRoot, expectedSourceBlobSha }) {
  assert.ok(typeof source === 'string' && path.isAbsolute(source), 'source must be an absolute path');
  assert.ok(typeof stagingRoot === 'string' && path.isAbsolute(stagingRoot), 'staging root must be an absolute path');
  assert.ok(typeof productionDocumentRoot === 'string' && path.isAbsolute(productionDocumentRoot),
    'production document root must be an absolute path');

  const checkoutRoot = fs.realpathSync(REPO_ROOT);
  const canonicalSource = path.resolve(source);
  assert.equal(source, canonicalSource, 'source must be canonical');
  assertNoSymlinkComponents(source, 'source');
  assert.equal(fs.realpathSync(source), source, 'source must not contain path aliases');
  assert.equal(source, path.join(checkoutRoot, 'dadyar-preview', 'index.html'),
    'source must be the reviewed dadyar-preview/index.html file');

  const stage = canonicalDirectory(stagingRoot, 'staging root');
  const production = canonicalDirectory(productionDocumentRoot, 'production document root');
  assert.ok(isOutside(checkoutRoot, stage), 'staging root must be outside Git checkout');
  assert.ok(isOutside(production, stage) && isOutside(stage, production),
    'staging root and production document root must be separate, non-nested trees');

  const stagedPreviewDirectory = path.join(stage, 'dadyar-preview');
  assertNoSymlinkComponents(stagedPreviewDirectory, 'staged preview directory');
  assert.equal(fs.realpathSync(stagedPreviewDirectory), stagedPreviewDirectory,
    'staged preview directory must not contain path aliases');
  assert.ok(fs.statSync(stagedPreviewDirectory).isDirectory(),
    'staged preview directory must exist as a directory');

  const entries = fs.readdirSync(stagedPreviewDirectory, { withFileTypes: true });
  assert.deepEqual(entries.map(entry => entry.name).sort(), ['index.html'],
    'staged dadyar-preview directory must contain only index.html');
  assert.ok(entries[0].isFile() && !entries[0].isSymbolicLink(),
    'staged index.html must be a regular file, not a link');

  const productionPreviewDirectory = path.join(production, 'dadyar-preview');
  try {
    fs.lstatSync(productionPreviewDirectory);
    throw new Error('production dadyar-preview target already exists; refusing overwrite');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const stagedIndex = path.join(stagedPreviewDirectory, 'index.html');
  const integrity = verifyPreview(source, stagedIndex, production, expectedSourceBlobSha);
  return {
    status: 'PREVIEW_LAYOUT_VERIFIED_NOT_DEPLOYED',
    source_blob_sha1: integrity.source_blob_sha1,
    source_sha256: integrity.source_sha256,
    staged_destination_sha256: integrity.destination_sha256,
    staging_root_realpath: stage,
    staged_preview_realpath: stagedPreviewDirectory,
    production_document_root_realpath: production,
    intended_public_path: '/dadyar-preview/',
    production_target_absent: true,
    destination_outside_git_checkout: true,
    no_copy_or_deployment_performed: true
  };
}

if (require.main === module) {
  const [source, stagingRoot, productionDocumentRoot, expectedSourceBlobSha] = process.argv.slice(2);
  if (!source || !stagingRoot || !productionDocumentRoot || !expectedSourceBlobSha) {
    console.error('Usage: node scripts/preview-release-layout.cjs SOURCE/index.html STAGING_ROOT PRODUCTION_DOCUMENT_ROOT EXPECTED_SOURCE_GIT_BLOB_SHA1');
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(verifyPreviewReleaseLayout({
        source, stagingRoot, productionDocumentRoot, expectedSourceBlobSha
      })));
    } catch (error) {
      console.error('NOT_VERIFIED:', error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { verifyPreviewReleaseLayout };
