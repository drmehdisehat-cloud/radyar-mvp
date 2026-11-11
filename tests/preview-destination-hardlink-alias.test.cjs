'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');
const { verifyPublicPreviewSubpath } = require('../scripts/verify-public-preview-subpath.cjs');

function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  const digest = crypto.createHash('sha1');
  digest.update('blob ' + bytes.length + String.fromCharCode(0));
  digest.update(bytes);
  return digest.digest('hex');
}
function fixture(t, mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-destination-hardlink-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const documentRoot = path.join(dir, 'public_html');
  const checkout = path.join(dir, 'reviewed-checkout');
  fs.mkdirSync(documentRoot);
  fs.mkdirSync(checkout);
  const source = path.join(checkout, 'index.html');
  fs.writeFileSync(source, '<!doctype html><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'; form-action \'none\'"><input id="export-ack"><button id="download" disabled>Download</button>');
  const expectedBlob = gitBlobSha(source);
  let destination;
  if (mode === 'staged') {
    const staging = path.join(dir, 'staging');
    fs.mkdirSync(staging);
    destination = path.join(staging, 'index.html');
  } else {
    const preview = path.join(documentRoot, 'dadyar-preview');
    fs.mkdirSync(preview);
    destination = path.join(preview, 'index.html');
  }
  fs.copyFileSync(source, destination);
  return { dir, documentRoot, source, destination, expectedBlob };
}
test('staged destination accepts an independent single-link copy', t => {
  const f = fixture(t, 'staged');
  const result = verifyPreview(f.source, f.destination, f.documentRoot, f.expectedBlob);
  assert.equal(result.matched, true);
  assert.equal(fs.statSync(f.destination).nlink, 1);
});
test('staged destination rejects a hard-link alias to an unrelated file', t => {
  const f = fixture(t, 'staged');
  const alias = path.join(f.dir, 'unrelated-file.html');
  fs.linkSync(f.destination, alias);
  assert.equal(fs.statSync(f.destination).nlink, 2);
  assert.throws(
    () => verifyPreview(f.source, f.destination, f.documentRoot, f.expectedBlob),
    /destination must not have hard-link aliases/
  );
});
test('public preview accepts an independent single-link copy', t => {
  const f = fixture(t, 'public');
  const result = verifyPublicPreviewSubpath(f.source, f.destination, f.documentRoot, f.expectedBlob);
  assert.equal(result.matched, true);
  assert.equal(fs.statSync(f.destination).nlink, 1);
});
test('public preview rejects a hard-link alias outside the dedicated directory', t => {
  const f = fixture(t, 'public');
  const alias = path.join(f.dir, 'unrelated-file.html');
  fs.linkSync(f.destination, alias);
  assert.equal(fs.statSync(f.destination).nlink, 2);
  assert.throws(
    () => verifyPublicPreviewSubpath(f.source, f.destination, f.documentRoot, f.expectedBlob),
    /public destination must not have hard-link aliases/
  );
});
