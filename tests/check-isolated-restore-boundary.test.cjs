'use strict';
// Synthetic path-boundary regression only; never evidence of a real restore.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function fixture(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const archive = path.join(dir, 'backup.tar.gz');
  const restoredRoot = path.join(dir, 'isolated');
  const productionDocumentRoot = path.join(dir, 'public_html');
  fs.mkdirSync(restoredRoot); fs.mkdirSync(productionDocumentRoot);
  const marker = path.join(restoredRoot, 'index.html');
  fs.writeFileSync(archive, 'synthetic bytes, not a real archive');
  fs.writeFileSync(marker, '<html>synthetic marker</html>');
  return { archive, restoredRoot, productionDocumentRoot, marker,
    args: { archive, restoredRoot, productionDocumentRoot, marker: 'index.html',
      expectedArchiveSha256: sha(archive), expectedMarkerSha256: sha(marker) } };
}
test('reject nested archive within restore tree, including deeper subdirectories', t => {
  const f = fixture(t, 'dadyar-restore-boundary-');
  const nested = path.join(f.restoredRoot, 'archives', 'daily');
  fs.mkdirSync(nested, { recursive: true });
  const archive = path.join(nested, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive');
  assert.throws(() => assertRestoreEvidence({ archive, ...f, marker: 'index.html',
    expectedArchiveSha256: sha(archive), expectedMarkerSha256: sha(f.marker) }),
    /archive must be outside restored root/);
});
test('accept sibling archive with shared directory prefix without claiming restore proof', t => {
  const f = fixture(t, 'dadyar-restore-sibling-');
  const archiveDir = path.join(path.dirname(f.restoredRoot), 'restored-archive');
  fs.mkdirSync(archiveDir);
  const archive = path.join(archiveDir, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive');
  const evidence = assertRestoreEvidence({ ...f.args, archive,
    expectedArchiveSha256: sha(archive) });
  assert.equal(evidence.restore_proven, false);
  assert.equal(evidence.evidence, 'archive-integrity-and-restored-file-only');
  assert.equal(evidence.archive_outside_git_checkout, true);
  assert.equal(evidence.restored_root_outside_git_checkout, true);
});


test('rejects a restore root that contains the production document root', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-root-overlap-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const restoredRoot = path.join(dir, 'isolated');
  const productionDocumentRoot = path.join(restoredRoot, 'public_html');
  const archive = path.join(dir, 'backup.tar.gz');
  fs.mkdirSync(productionDocumentRoot, { recursive: true });
  fs.writeFileSync(archive, 'synthetic archive');
  const markerPath = path.join(restoredRoot, 'restore-marker.txt');
  fs.writeFileSync(markerPath, 'synthetic restored marker');
  assert.throws(() => assertRestoreEvidence({
    archive,
    restoredRoot,
    productionDocumentRoot,
    marker: 'restore-marker.txt',
    expectedArchiveSha256: sha(archive),
    expectedMarkerSha256: sha(markerPath)
  }), /restored root must be outside production document root/);
});

test('rejects a backup archive placed inside the Git checkout', t => {
  const f = fixture(t, 'dadyar-restore-repo-archive-');
  const checkoutTemp = fs.mkdtempSync(path.join(path.resolve(__dirname, '..'), '.dadyar-restore-archive-'));
  t.after(() => fs.rmSync(checkoutTemp, { recursive: true, force: true }));
  const archive = path.join(checkoutTemp, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive only');
  assert.throws(() => assertRestoreEvidence({
    ...f.args,
    archive,
    expectedArchiveSha256: sha(archive)
  }), /archive must be outside Git checkout/);
});

test('rejects a restored client-data tree placed inside the Git checkout', t => {
  const f = fixture(t, 'dadyar-restore-repo-root-');
  const checkoutTemp = fs.mkdtempSync(path.join(path.resolve(__dirname, '..'), '.dadyar-restore-root-'));
  t.after(() => fs.rmSync(checkoutTemp, { recursive: true, force: true }));
  const restoredRoot = path.join(checkoutTemp, 'restored');
  fs.mkdirSync(restoredRoot);
  const marker = path.join(restoredRoot, 'index.html');
  fs.writeFileSync(marker, '<html>synthetic restored marker</html>');
  assert.throws(() => assertRestoreEvidence({
    ...f.args,
    restoredRoot,
    expectedMarkerSha256: sha(marker)
  }), /restored root must be outside Git checkout/);
});
