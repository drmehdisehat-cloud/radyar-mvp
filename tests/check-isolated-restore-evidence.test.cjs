'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(t, prefix = 'dadyar-restore-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const productionDocumentRoot = path.join(dir, 'public_html');
  const restoredRoot = path.join(dir, 'restored');
  const archive = path.join(dir, 'backup.tar.gz');
  fs.mkdirSync(productionDocumentRoot);
  fs.mkdirSync(restoredRoot);
  fs.writeFileSync(archive, 'synthetic archive fixture');
  const marker = path.join(restoredRoot, 'index.html');
  fs.writeFileSync(marker, 'synthetic restored marker');
  return { dir, archive, restoredRoot, productionDocumentRoot, marker,
    args: { archive, restoredRoot, productionDocumentRoot, marker: 'index.html',
      expectedArchiveSha256: sha(archive), expectedMarkerSha256: sha(marker) } };
}
test('integrity evidence remains explicitly insufficient for release', t => {
  const f = fixture(t);
  assert.throws(() => assertRestoreEvidence({ ...f.args, expectedMarkerSha256: '0'.repeat(64) }), /restored marker SHA-256 mismatch/);
  assert.throws(() => assertRestoreEvidence({ ...f.args, expectedMarkerSha256: undefined }), /expected restored marker SHA-256 required/);
  const evidence = assertRestoreEvidence(f.args);
  assert.equal(evidence.restore_proven, false);
  assert.equal(evidence.archive_sha256, sha(f.archive));
  assert.equal(evidence.restored_marker_sha256, sha(f.marker));
  assert.equal(evidence.production_document_root_realpath, f.productionDocumentRoot);
  assert.throws(() => assertRestoreEvidence({ ...f.args, expectedArchiveSha256: '0'.repeat(64) }), /archive SHA-256 mismatch/);
  assert.throws(() => assertRestoreEvidence({ ...f.args, marker: '../backup.tar.gz' }), /relative path/);
  fs.rmSync(f.marker);
  assert.throws(() => assertRestoreEvidence(f.args), /ENOENT/);
});
test('rejects an intermediate symlink even when its target remains inside restored root', t => {
  const f = fixture(t, 'dadyar-restore-link-');
  const actual = path.join(f.restoredRoot, 'actual');
  fs.mkdirSync(actual);
  fs.writeFileSync(path.join(actual, 'index.html'), 'synthetic');
  fs.symlinkSync(actual, path.join(f.restoredRoot, 'alias'), 'dir');
  assert.throws(() => assertRestoreEvidence({ ...f.args, marker: 'alias/index.html',
    expectedMarkerSha256: sha(path.join(actual, 'index.html')) }), /symlink/);
});
test('rejects symlinked archive and restored root even with valid synthetic hashes', t => {
  const f = fixture(t, 'dadyar-restore-toplink-');
  const archiveLink = path.join(f.dir, 'archive-link.tar.gz');
  const rootLink = path.join(f.dir, 'root-link');
  fs.symlinkSync(f.archive, archiveLink);
  fs.symlinkSync(f.restoredRoot, rootLink, 'dir');
  assert.throws(() => assertRestoreEvidence({ ...f.args, archive: archiveLink }), /archive path must not contain symlinks/);
  assert.throws(() => assertRestoreEvidence({ ...f.args, restoredRoot: rootLink }), /restored root path must not contain symlinks/);
});
test('rejects symlinked parent directories for archive and restore root', t => {
  const f = fixture(t, 'dadyar-restore-ancestor-');
  const actual = path.join(f.dir, 'actual');
  fs.mkdirSync(actual);
  const archive = path.join(actual, 'backup.tar.gz');
  const root = path.join(actual, 'restored');
  fs.renameSync(f.archive, archive);
  fs.renameSync(f.restoredRoot, root);
  const alias = path.join(f.dir, 'alias');
  fs.symlinkSync(actual, alias, 'dir');
  assert.throws(() => assertRestoreEvidence({ ...f.args, archive: path.join(alias, 'backup.tar.gz') }), /archive path must not contain symlinks/);
  assert.throws(() => assertRestoreEvidence({ ...f.args, restoredRoot: path.join(alias, 'restored') }), /restored root path must not contain symlinks/);
});
test('rejects archive stored within purported independent restore tree', t => {
  const f = fixture(t, 'dadyar-restore-inplace-');
  const nestedArchive = path.join(f.restoredRoot, 'backup.tar.gz');
  fs.writeFileSync(nestedArchive, 'synthetic nested archive');
  assert.throws(() => assertRestoreEvidence({ ...f.args, archive: nestedArchive,
    expectedArchiveSha256: sha(nestedArchive) }), /archive must be outside restored root/);
});
test('rejects a restore root placed inside the production document root', t => {
  const f = fixture(t, 'dadyar-restore-webroot-');
  const nestedRoot = path.join(f.productionDocumentRoot, 'restore');
  fs.mkdirSync(nestedRoot);
  fs.writeFileSync(path.join(nestedRoot, 'index.html'), 'synthetic restored marker');
  assert.throws(() => assertRestoreEvidence({ ...f.args, restoredRoot: nestedRoot,
    expectedMarkerSha256: sha(path.join(nestedRoot, 'index.html')) }), /restored root must be outside production document root/);
});
test('rejects an archive stored inside the production document root', t => {
  const f = fixture(t, 'dadyar-archive-webroot-');
  const nestedArchive = path.join(f.productionDocumentRoot, 'backup.tar.gz');
  fs.writeFileSync(nestedArchive, 'synthetic archive');
  assert.throws(() => assertRestoreEvidence({ ...f.args, archive: nestedArchive,
    expectedArchiveSha256: sha(nestedArchive) }), /archive must be outside production document root/);
});
test('rejects a symlinked production document root', t => {
  const f = fixture(t, 'dadyar-restore-docroot-link-');
  const alias = path.join(f.dir, 'public-alias');
  fs.symlinkSync(f.productionDocumentRoot, alias, 'dir');
  assert.throws(() => assertRestoreEvidence({ ...f.args, productionDocumentRoot: alias }), /production document root path must not contain symlinks/);
});
