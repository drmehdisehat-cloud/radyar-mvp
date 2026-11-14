'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const archive = path.join(dir, 'backup.tar.gz');
  const restoredRoot = path.join(dir, 'restored');
  const productionDocumentRoot = path.join(dir, 'public_html');
  fs.mkdirSync(restoredRoot); fs.mkdirSync(productionDocumentRoot);
  return { archive, restoredRoot, productionDocumentRoot, dir };
}
test('empty archive is rejected despite matching SHA-256 and nonempty restored marker', t => {
  const f = fixture(t, 'dadyar-empty-archive-');
  fs.writeFileSync(f.archive, '');
  const marker = path.join(f.restoredRoot, 'index.html'); fs.writeFileSync(marker, 'synthetic only');
  assert.throws(() => assertRestoreEvidence({ ...f, marker: 'index.html',
    expectedArchiveSha256: sha(f.archive), expectedMarkerSha256: sha(marker) }), /archive must not be empty/);
});
test('empty restored marker is rejected despite matching SHA-256 and nonempty archive', t => {
  const f = fixture(t, 'dadyar-empty-marker-');
  fs.writeFileSync(f.archive, 'synthetic archive');
  const marker = path.join(f.restoredRoot, 'index.html'); fs.writeFileSync(marker, '');
  assert.throws(() => assertRestoreEvidence({ ...f, marker: 'index.html',
    expectedArchiveSha256: sha(f.archive), expectedMarkerSha256: sha(marker) }), /restored marker must not be empty/);
});
