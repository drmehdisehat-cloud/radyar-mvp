'use strict';
// Synthetic path-boundary regression only; never evidence of a real restore.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
function setup(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const restoredRoot = path.join(dir, 'restored');
  const productionDocumentRoot = path.join(dir, 'public_html');
  fs.mkdirSync(restoredRoot);
  fs.mkdirSync(productionDocumentRoot);
  fs.writeFileSync(path.join(restoredRoot, 'index.html'), 'synthetic marker');
  return { dir, restoredRoot, productionDocumentRoot };
}
test('reject nested archive within restore tree, including deeper subdirectories', t => {
  const f = setup(t, 'dadyar-restore-boundary-');
  const nested = path.join(f.restoredRoot, 'archives', 'daily');
  fs.mkdirSync(nested, { recursive: true });
  const archive = path.join(nested, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive');
  assert.throws(() => assertRestoreEvidence({ archive, ...f, marker: 'index.html',
    expectedArchiveSha256: sha('synthetic archive'), expectedMarkerSha256: sha('synthetic marker') }),
    /archive must be outside restored root/);
});
test('accept sibling archive with shared directory prefix without claiming restore proof', t => {
  const f = setup(t, 'dadyar-restore-sibling-');
  const archiveDir = path.join(f.dir, 'restored-archive');
  fs.mkdirSync(archiveDir);
  const archive = path.join(archiveDir, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive');
  const evidence = assertRestoreEvidence({ archive, ...f, marker: 'index.html',
    expectedArchiveSha256: sha('synthetic archive'), expectedMarkerSha256: sha('synthetic marker') });
  assert.equal(evidence.restore_proven, false);
  assert.equal(evidence.evidence, 'archive-integrity-and-restored-file-only');
});
