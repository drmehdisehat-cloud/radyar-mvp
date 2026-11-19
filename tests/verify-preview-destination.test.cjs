'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');
const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(REPO_ROOT, 'dadyar-preview', 'index.html');

function gitBlobSha(bytes) {
  const hash = crypto.createHash('sha1');
  hash.update('blob ' + bytes.length + String.fromCharCode(0));
  hash.update(bytes);
  return hash.digest('hex');
}

function makeDirectory(directory, mode = 0o700) {
  fs.mkdirSync(directory, { recursive: true, mode });
  fs.chmodSync(directory, mode);
}

function fixture(t, destinationFactory) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-destination-'));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const stagingParent = path.join(root, 'staging');
  const stagingDirectory = path.join(stagingParent, 'dadyar-preview');
  const productionRoot = path.join(root, 'production', 'public_html');
  makeDirectory(stagingParent);
  makeDirectory(stagingDirectory);
  makeDirectory(productionRoot);

  const destination = destinationFactory
    ? destinationFactory({ root, stagingDirectory, productionRoot })
    : path.join(stagingDirectory, 'index.html');
  if (!fs.existsSync(destination)) {
    makeDirectory(path.dirname(destination));
    fs.copyFileSync(SOURCE, destination);
    fs.chmodSync(destination, 0o644);
  }

  const bytes = fs.readFileSync(SOURCE);
  return {
    root,
    source: SOURCE,
    destination,
    productionRoot,
    expectedBlob: gitBlobSha(bytes)
  };
}

test('accepts an exact staged copy outside the production document root and checkout', t => {
  const f = fixture(t);
  const result = verifyPreview(f.source, f.destination, f.productionRoot, f.expectedBlob);

  assert.equal(result.matched, true);
  assert.equal(result.destination_outside_document_root, true);
  assert.equal(result.destination_outside_git_checkout, true);
  assert.equal(result.source_blob_sha1, f.expectedBlob);
  assert.equal(result.source_sha256, result.destination_sha256);
});

test('rejects a placeholder or malformed reviewed Git blob pin', t => {
  const f = fixture(t);
  assert.throws(
    () => verifyPreview(f.source, f.destination, f.productionRoot, '0'.repeat(40)),
    /expected reviewed source Git blob SHA-1 required/
  );
  assert.throws(
    () => verifyPreview(f.source, f.destination, f.productionRoot, 'not-a-git-blob'),
    /expected reviewed source Git blob SHA-1 required/
  );
});

test('rejects a destination whose bytes differ from the reviewed source', t => {
  const f = fixture(t);
  fs.appendFileSync(f.destination, Buffer.from('synthetic tamper'));
  assert.throws(
    () => verifyPreview(f.source, f.destination, f.productionRoot, f.expectedBlob),
    /destination differs from reviewed source/
  );
});

test('rejects a source that no longer matches the reviewed Git blob pin', t => {
  const f = fixture(t);
  const alteredSource = path.join(f.root, 'source', 'index.html');
  makeDirectory(path.dirname(alteredSource));
  fs.writeFileSync(alteredSource, Buffer.concat([fs.readFileSync(SOURCE), Buffer.from('synthetic source change')]));
  const alteredDestination = path.join(f.root, 'staging', 'dadyar-preview', 'index.html');
  fs.copyFileSync(alteredSource, alteredDestination);
  assert.throws(
    () => verifyPreview(alteredSource, alteredDestination, f.productionRoot, f.expectedBlob),
    /source differs from pinned reviewed Git blob/
  );
});

test('rejects a symlink destination before reading its target', t => {
  const f = fixture(t);
  fs.unlinkSync(f.destination);
  fs.symlinkSync(f.source, f.destination);
  assert.throws(
    () => verifyPreview(f.source, f.destination, f.productionRoot, f.expectedBlob),
    /destination must not be a symbolic link/
  );
});

test('rejects a symlinked destination ancestor', t => {
  const f = fixture(t);
  const aliasParent = path.join(f.root, 'staging-alias');
  fs.symlinkSync(path.dirname(f.destination), aliasParent, 'dir');
  const aliasedDestination = path.join(aliasParent, 'index.html');
  assert.throws(
    () => verifyPreview(f.source, aliasedDestination, f.productionRoot, f.expectedBlob),
    /destination parent must not be a symbolic link/
  );
});

test('rejects a hard-linked destination alias to the source', t => {
  const f = fixture(t);
  const localSource = path.join(f.root, 'source', 'index.html');
  makeDirectory(path.dirname(localSource));
  fs.copyFileSync(SOURCE, localSource);
  fs.unlinkSync(f.destination);
  fs.linkSync(localSource, f.destination);
  assert.throws(
    () => verifyPreview(localSource, f.destination, f.productionRoot, f.expectedBlob),
    /destination must not be a hard link to source/
  );
});

test('rejects a destination nested inside the production document root', t => {
  const f = fixture(t, ({ productionRoot }) => {
    const directory = path.join(productionRoot, 'dadyar-preview');
    makeDirectory(directory);
    return path.join(directory, 'index.html');
  });
  assert.throws(
    () => verifyPreview(f.source, f.destination, f.productionRoot, f.expectedBlob),
    /destination must be outside production document root/
  );
});

test('rejects a destination below a group/world-writable staging directory', t => {
  const f = fixture(t);
  fs.chmodSync(path.dirname(f.destination), 0o777);
  assert.throws(
    () => verifyPreview(f.source, f.destination, f.productionRoot, f.expectedBlob),
    /destination directory must not be group or world writable/
  );
});

test('rejects non-canonical paths containing traversal segments', t => {
  const f = fixture(t);
  const nonCanonical = path.dirname(f.destination) + '/../dadyar-preview/index.html';
  assert.throws(
    () => verifyPreview(f.source, nonCanonical, f.productionRoot, f.expectedBlob),
    /destination path must be canonical/
  );
});

test('rejects a destination inside the Git checkout', t => {
  const f = fixture(t);
  const internalDirectory = fs.mkdtempSync(path.join(REPO_ROOT, '.dadyar-destination-test-'));
  try {
    fs.chmodSync(internalDirectory, 0o700);
    const previewDirectory = path.join(internalDirectory, 'dadyar-preview');
    makeDirectory(previewDirectory);
    const internalDestination = path.join(previewDirectory, 'index.html');
    fs.copyFileSync(SOURCE, internalDestination);
    fs.chmodSync(internalDestination, 0o644);
    assert.throws(
      () => verifyPreview(f.source, internalDestination, f.productionRoot, f.expectedBlob),
      /destination must be outside Git checkout/
    );
  } finally {
    fs.rmSync(internalDirectory, { recursive: true, force: true });
  }
});

test('rejects a writable ancestor above the dedicated preview directory', t => {
  const f = fixture(t);
  const stagingRoot = path.dirname(path.dirname(f.destination));
  fs.chmodSync(stagingRoot, 0o777);
  assert.throws(
    () => verifyPreview(f.source, f.destination, f.productionRoot, f.expectedBlob),
    /destination ancestor must not be group or world writable unless root-owned and sticky/
  );
});

test('rejects setgid or setuid bits on an ancestor above the preview directory', t => {
  const f = fixture(t);
  const stagingRoot = path.dirname(path.dirname(f.destination));
  fs.chmodSync(stagingRoot, 0o2770);
  assert.throws(
    () => verifyPreview(f.source, f.destination, f.productionRoot, f.expectedBlob),
    /destination ancestor must not have setuid or setgid bits/
  );
});
