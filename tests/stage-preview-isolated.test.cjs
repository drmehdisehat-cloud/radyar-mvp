'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { stagePreviewIsolated, assertPrivateOwnedDirectory } = require('../scripts/stage-preview-isolated.cjs');

const repoRoot = path.resolve(__dirname, '..');
const source = path.join(repoRoot, 'dadyar-preview', 'index.html');
const sourceBytes = fs.readFileSync(source);
function gitBlobSha1(bytes) {
  const digest = crypto.createHash('sha1');
  digest.update('blob ' + bytes.length + String.fromCharCode(0));
  digest.update(bytes);
  return digest.digest('hex');
}
const expectedBlob = gitBlobSha1(sourceBytes);

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-isolated-stage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stagingRoot = path.join(root, 'isolated-staging');
  const productionRoot = path.join(root, 'production', 'public_html');
  fs.mkdirSync(stagingRoot, { mode: 0o700 });
  fs.mkdirSync(productionRoot, { recursive: true, mode: 0o755 });
  fs.writeFileSync(path.join(productionRoot, 'keep.txt'), 'production sentinel', { mode: 0o644 });
  return { root, stagingRoot, productionRoot };
}

test('requires the isolated staging root to be owned by the current service user', () => {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  assert.doesNotThrow(() => assertPrivateOwnedDirectory({ mode: 0o40700, uid }, 'staging root', uid));
  assert.throws(
    () => assertPrivateOwnedDirectory({ mode: 0o40700, uid: uid + 1 }, 'staging root', uid),
    /owned by the current service user/
  );
  assert.throws(
    () => assertPrivateOwnedDirectory({ mode: 0o40700 }, 'staging root', uid),
    /ownership could not be verified/
  );
});

test('rejects group- or world-writable staging roots before creating preview files', t => {
  const f = fixture(t);
  fs.chmodSync(f.stagingRoot, 0o777);
  assert.throws(() => stagePreviewIsolated({
    source, stagingRoot: f.stagingRoot, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: expectedBlob
  }), /must not be group- or world-writable/);
  assert.equal(fs.existsSync(path.join(f.stagingRoot, 'dadyar-preview')), false);
});

test('copies only the pinned preview into a new isolated staging folder without deployment', t => {
  const f = fixture(t);
  const result = stagePreviewIsolated({
    source, stagingRoot: f.stagingRoot, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: expectedBlob
  });
  const destinationDirectory = path.join(f.stagingRoot, 'dadyar-preview');
  const destination = path.join(destinationDirectory, 'index.html');
  assert.equal(result.status, 'ISOLATED_STAGING_COPY_VERIFIED_NOT_DEPLOYED');
  assert.equal(result.source_blob_sha1, expectedBlob);
  assert.equal(result.source_sha256, result.destination_sha256);
  assert.equal(result.deployment_authorized, false);
  assert.equal(result.restore_proven, false);
  assert.equal(result.production_document_root_untouched, true);
  assert.equal(result.git_checkout_untouched, true);
  assert.deepEqual(fs.readdirSync(destinationDirectory), ['index.html']);
  assert.deepEqual(fs.readFileSync(destination), sourceBytes);
  assert.equal(fs.readFileSync(path.join(f.productionRoot, 'keep.txt'), 'utf8'), 'production sentinel');
  const mode = fs.statSync(destination).mode;
  assert.equal(mode & 0o022, 0, 'staged file must not be group/world writable');
});

test('rejects a wrong pinned source blob before creating the staging folder', t => {
  const f = fixture(t);
  assert.throws(() => stagePreviewIsolated({
    source, stagingRoot: f.stagingRoot, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: '1'.repeat(40)
  }), /source differs from the pinned reviewed Git blob/);
  assert.equal(fs.existsSync(path.join(f.stagingRoot, 'dadyar-preview')), false);
});

test('refuses to overwrite an existing preview folder or any file inside it', t => {
  const f = fixture(t);
  const existing = path.join(f.stagingRoot, 'dadyar-preview');
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, 'keep.txt'), 'do not overwrite');
  assert.throws(() => stagePreviewIsolated({
    source, stagingRoot: f.stagingRoot, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: expectedBlob
  }), /already exists; refusing overwrite/);
  assert.equal(fs.readFileSync(path.join(existing, 'keep.txt'), 'utf8'), 'do not overwrite');
  assert.deepEqual(fs.readdirSync(existing), ['keep.txt']);
});

test('rejects a staging root inside the production document root', t => {
  const f = fixture(t);
  const nested = path.join(f.productionRoot, 'isolated-staging');
  fs.mkdirSync(nested, { mode: 0o700 });
  assert.throws(() => stagePreviewIsolated({
    source, stagingRoot: nested, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: expectedBlob
  }), /disjoint from production document root/);
  assert.equal(fs.existsSync(path.join(nested, 'dadyar-preview')), false);
});

test('rejects a staging root that is an ancestor of the production document root', t => {
  const f = fixture(t);
  assert.throws(() => stagePreviewIsolated({
    source, stagingRoot: f.root, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: expectedBlob
  }), /disjoint from production document root/);
  assert.equal(fs.existsSync(path.join(f.root, 'dadyar-preview')), false);
});

test('rejects the Git checkout as a staging root', t => {
  const f = fixture(t);
  assert.throws(() => stagePreviewIsolated({
    source, stagingRoot: repoRoot, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: expectedBlob
  }), /disjoint from Git checkout/);
  assert.equal(fs.existsSync(path.join(repoRoot, 'dadyar-preview', 'dadyar-preview')), false);
});

test('rejects a symlinked staging root and non-canonical path aliases', t => {
  const f = fixture(t);
  const alias = path.join(f.root, 'staging-alias');
  fs.symlinkSync(f.stagingRoot, alias, 'dir');
  assert.throws(() => stagePreviewIsolated({
    source, stagingRoot: alias, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: expectedBlob
  }), /symbolic link/);
  const nonCanonical = f.stagingRoot + path.sep + '.' + path.sep;
  assert.throws(() => stagePreviewIsolated({
    source, stagingRoot: nonCanonical, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: expectedBlob
  }), /absolute canonical path/);
  assert.equal(fs.existsSync(path.join(f.stagingRoot, 'dadyar-preview')), false);
});

test('accepts only the exact checked-out preview source path', t => {
  const f = fixture(t);
  const copy = path.join(f.root, 'index.html');
  fs.copyFileSync(source, copy);
  assert.throws(() => stagePreviewIsolated({
    source: copy, stagingRoot: f.stagingRoot, productionDocumentRoot: f.productionRoot,
    expectedSourceBlobSha1: expectedBlob
  }), /reviewed dadyar-preview\/index.html in this checkout/);
  assert.equal(fs.existsSync(path.join(f.stagingRoot, 'dadyar-preview')), false);
});
