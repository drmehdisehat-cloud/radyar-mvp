'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  const digest = crypto.createHash('sha1');
  digest.update(`blob ${bytes.length}\0`);
  digest.update(bytes);
  return digest.digest('hex');
}
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');

const fixture = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'; form-action \'none\'"><input id="export-ack"><button id="download" disabled>Download</button>';

function sandbox(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-preview-integrity-'));
  try {
    const sourceDir = path.join(root, 'source');
    const destDir = path.join(root, 'destination');
    const productionRoot = path.join(root, 'production-root');
    fs.mkdirSync(sourceDir);
    fs.mkdirSync(destDir);
    fs.mkdirSync(productionRoot);
    const source = path.join(sourceDir, 'index.html');
    const destination = path.join(destDir, 'index.html');
    fs.writeFileSync(source, fixture);
    return fn({ root, source, destination, destDir, productionRoot, expectedSourceBlobSha: gitBlobSha(source) });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('independent identical preview files pass with matching digests', () => sandbox(({source, destination, productionRoot, expectedSourceBlobSha}) => {
  fs.copyFileSync(source, destination);
  const result = verifyPreview(source, destination, productionRoot, expectedSourceBlobSha);
  assert.equal(result.matched, true);
  assert.match(result.source_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.source_sha256, result.destination_sha256);
}));

test('modified destination is rejected even when both files are HTML', () => sandbox(({source, destination, productionRoot, expectedSourceBlobSha}) => {
  fs.writeFileSync(destination, fixture + '<p>changed</p>');
  assert.throws(() => verifyPreview(source, destination, productionRoot, expectedSourceBlobSha), /destination differs/);
}));

test('hard-linked destination is not independent deployment evidence', () => sandbox(({source, destination, productionRoot, expectedSourceBlobSha}) => {
  fs.linkSync(source, destination);
  assert.throws(() => verifyPreview(source, destination, productionRoot, expectedSourceBlobSha), /hard link/);
}));

test('symlinked destination ancestor is rejected', () => sandbox(({root, source, destDir, productionRoot, expectedSourceBlobSha}) => {
  const alias = path.join(root, 'alias');
  fs.symlinkSync(destDir, alias, 'dir');
  fs.copyFileSync(source, path.join(destDir, 'index.html'));
  assert.throws(() => verifyPreview(source, path.join(alias, 'index.html'), productionRoot, expectedSourceBlobSha), /symbolic link/);
}));

test('symlinked source ancestor is rejected', () => sandbox(({root, source, destination, productionRoot, expectedSourceBlobSha}) => {
  const alias = path.join(root, 'source-alias');
  fs.symlinkSync(path.dirname(source), alias, 'dir');
  fs.copyFileSync(source, destination);
  assert.throws(() => verifyPreview(path.join(alias, 'index.html'), destination, productionRoot, expectedSourceBlobSha), /symbolic link/);
}));
