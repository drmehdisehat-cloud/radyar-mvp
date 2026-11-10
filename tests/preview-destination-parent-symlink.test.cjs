'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');

test('preview destination rejects symlinked parent even with matching independent bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-parent-link-'));
  try {
    const source = path.resolve(__dirname, '../dadyar-preview/index.html');
    const productionRoot = path.join(root, 'production-root');
    fs.mkdirSync(productionRoot);
    const realDir = path.join(root, 'actual-preview');
    fs.mkdirSync(realDir);
    const realDestination = path.join(realDir, 'index.html');
    fs.copyFileSync(source, realDestination);
    assert.equal(verifyPreview(source, realDestination, productionRoot).matched, true);
    const aliasDir = path.join(root, 'dadyar-preview');
    fs.symlinkSync(realDir, aliasDir, 'dir');
    assert.throws(
      () => verifyPreview(source, path.join(aliasDir, 'index.html'), productionRoot),
      /destination parent must not be a symbolic link/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preview destination verifier rejects a symlinked production document root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-docroot-link-'));
  try {
    const source = path.resolve(__dirname, '../dadyar-preview/index.html');
    const staging = path.join(root, 'staging');
    const realRoot = path.join(root, 'real-production-root');
    const rootAlias = path.join(root, 'production-root');
    fs.mkdirSync(staging); fs.mkdirSync(realRoot);
    const destination = path.join(staging, 'index.html');
    fs.copyFileSync(source, destination);
    fs.symlinkSync(realRoot, rootAlias, 'dir');
    assert.throws(() => verifyPreview(source, destination, rootAlias), /production document root path must not contain symlinks/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
