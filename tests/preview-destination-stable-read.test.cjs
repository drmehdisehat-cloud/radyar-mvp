'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-preview-destination-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const production = path.join(dir, 'public_html');
  const repo = path.join(dir, 'repo');
  const staging = path.join(dir, 'staging');
  fs.mkdirSync(production); fs.mkdirSync(repo); fs.mkdirSync(staging);
  const source = path.join(repo, 'index.html');
  const destination = path.join(staging, 'index.html');
  const html = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'; form-action \'none\'"><input id="export-ack"><button id="download" disabled>Download</button>';
  fs.writeFileSync(source, html);
  fs.writeFileSync(destination, html);
  const blob = crypto.createHash('sha1').update('blob ' + Buffer.byteLength(html) + '\0').update(html).digest('hex');
  return { dir, production, source, destination, blob };
}
test('destination preflight accepts a byte-identical isolated regular file', t => {
  const f = fixture(t);
  const result = verifyPreview(f.source, f.destination, f.production, f.blob);
  assert.equal(result.matched, true);
  assert.equal(result.destination_outside_document_root, true);
  assert.equal(result.source_blob_sha1, f.blob);
  assert.equal(result.source_sha256, result.destination_sha256);
});
test('destination preflight rejects a destination hard-linked to the source', t => {
  const f = fixture(t);
  fs.unlinkSync(f.destination);
  fs.linkSync(f.source, f.destination);
  assert.throws(() => verifyPreview(f.source, f.destination, f.production, f.blob), /hard-link aliases/);
});
test('destination preflight rejects a destination inside the live document root', t => {
  const f = fixture(t);
  const unsafe = path.join(f.production, 'index.html');
  fs.writeFileSync(unsafe, fs.readFileSync(f.source));
  assert.throws(() => verifyPreview(f.source, unsafe, f.production, f.blob), /outside production document root/);
});
test('destination preflight rejects a symlinked destination', t => {
  const f = fixture(t);
  const target = path.join(f.dir, 'elsewhere.html');
  fs.renameSync(f.destination, target);
  fs.symlinkSync(target, f.destination);
  assert.throws(() => verifyPreview(f.source, f.destination, f.production, f.blob), /symbolic link/);
});
