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

test('rejects a symlinked reviewed source even when content matches', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-source-link-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const actual = path.join(root, 'actual');
  const linked = path.join(root, 'linked');
  const deployed = path.join(root, 'deployed');
  const productionRoot = path.join(root, 'production-root');
  fs.mkdirSync(actual);
  fs.mkdirSync(linked);
  fs.mkdirSync(deployed);
  fs.mkdirSync(productionRoot);
  const html = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; connect-src 'none'; form-action 'none'\"><input id=\"export-ack\"><button id=\"download\" disabled>";
  fs.writeFileSync(path.join(actual, 'index.html'), html);
  fs.writeFileSync(path.join(deployed, 'index.html'), html);
  const expectedSourceBlobSha = gitBlobSha(path.join(actual, 'index.html'));
  fs.symlinkSync(path.join(actual, 'index.html'), path.join(linked, 'index.html'));
  assert.throws(() => verifyPreview(path.join(linked, 'index.html'), path.join(deployed, 'index.html'), productionRoot, expectedSourceBlobSha), /source must not be a symbolic link/);
});

test('rejects symlinked ancestor of reviewed source', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-source-parent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const real = path.join(root, 'real');
  const alias = path.join(root, 'alias');
  const deployed = path.join(root, 'deployed');
  const productionRoot = path.join(root, 'production-root');
  fs.mkdirSync(real);
  fs.mkdirSync(deployed);
  fs.mkdirSync(productionRoot);
  fs.writeFileSync(path.join(real, 'index.html'), 'synthetic');
  fs.writeFileSync(path.join(deployed, 'index.html'), 'synthetic');
  const expectedSourceBlobSha = gitBlobSha(path.join(real, 'index.html'));
  fs.symlinkSync(real, alias, 'dir');
  assert.throws(() => verifyPreview(path.join(alias, 'index.html'), path.join(deployed, 'index.html'), productionRoot, expectedSourceBlobSha), /source parent must not be a symbolic link/);
});
