'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createManifest, verifyManifest } = require('../scripts/preview-artifact-manifest.cjs');

const COMMIT = '3eef848c1b42a5767babaeb13e46636833b74c86';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-preview-manifest-'));
  fs.mkdirSync(path.join(root, 'dadyar-preview'));
  fs.writeFileSync(path.join(root, 'dadyar-preview', 'index.html'), '<!doctype html><html lang="fa"></html>\n');
  fs.writeFileSync(path.join(root, 'dadyar-preview', 'data.json'), '{"synthetic":true}\n');
  fs.writeFileSync(path.join(root, '1405-delay-index-source-status.md'), 'source status: not independently authenticated\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('creates a deterministic manifest bound to the exact source commit and payload hashes', t => {
  const root = fixture(t);
  const manifest = createManifest(root, COMMIT);
  assert.equal(manifest.schema, 'dadyar-preview-artifact-manifest-v1');
  assert.equal(manifest.sourceCommit, COMMIT);
  assert.deepEqual(manifest.files.map(file => file.path), [
    '1405-delay-index-source-status.md',
    'dadyar-preview/data.json',
    'dadyar-preview/index.html'
  ]);
  assert.deepEqual(verifyManifest(root), { sourceCommit: COMMIT, files: 2, verified: true });
});

test('rejects a payload modified after manifest creation', t => {
  const root = fixture(t);
  createManifest(root, COMMIT);
  fs.appendFileSync(path.join(root, 'dadyar-preview', 'index.html'), '<!-- changed -->');
  assert.throws(() => verifyManifest(root), /integrity mismatch/);
});

test('rejects unexpected files added after manifest creation', t => {
  const root = fixture(t);
  createManifest(root, COMMIT);
  fs.writeFileSync(path.join(root, 'unexpected.txt'), 'not part of the handoff');
  assert.throws(() => verifyManifest(root), /Unexpected artifact top-level entries/);
});

test('rejects path traversal in a manifest', t => {
  const root = fixture(t);
  createManifest(root, COMMIT);
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.files[0].path = '../outside.txt';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => verifyManifest(root), /Unsafe or invalid path/);
});

test('rejects symlinks inside the preview payload', t => {
  const root = fixture(t);
  createManifest(root, COMMIT);
  fs.symlinkSync(path.join(root, 'dadyar-preview', 'index.html'), path.join(root, 'dadyar-preview', 'alias.html'));
  assert.throws(() => verifyManifest(root), /Symbolic links are not allowed/);
});

test('requires a full source commit SHA', t => {
  const root = fixture(t);
  assert.throws(() => createManifest(root, 'deadbeef'), /full 40-character/);
});
