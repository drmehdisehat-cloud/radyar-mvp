'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');

test('rejects a symlinked reviewed source even when content matches', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-source-link-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const actual = path.join(root, 'actual');
  const linked = path.join(root, 'linked');
  const deployed = path.join(root, 'deployed');
  fs.mkdirSync(actual);
  fs.mkdirSync(linked);
  fs.mkdirSync(deployed);
  const html = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; connect-src 'none'; form-action 'none'\"><input id=\"export-ack\"><button id=\"download\" disabled>";
  fs.writeFileSync(path.join(actual, 'index.html'), html);
  fs.writeFileSync(path.join(deployed, 'index.html'), html);
  fs.symlinkSync(path.join(actual, 'index.html'), path.join(linked, 'index.html'));
  assert.throws(() => verifyPreview(path.join(linked, 'index.html'), path.join(deployed, 'index.html')), /source must not be a symbolic link/);
});

test('rejects symlinked ancestor of reviewed source', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-source-parent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const real = path.join(root, 'real');
  const alias = path.join(root, 'alias');
  const deployed = path.join(root, 'deployed');
  fs.mkdirSync(real);
  fs.mkdirSync(deployed);
  fs.writeFileSync(path.join(real, 'index.html'), 'synthetic');
  fs.writeFileSync(path.join(deployed, 'index.html'), 'synthetic');
  fs.symlinkSync(real, alias, 'dir');
  assert.throws(() => verifyPreview(path.join(alias, 'index.html'), path.join(deployed, 'index.html')), /source parent must not be a symbolic link/);
});
