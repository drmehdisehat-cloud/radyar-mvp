'use strict';
// Synthetic boundary regression only. This cannot prove an actual backup restore.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
test('archive hard-linked into restored tree cannot impersonate restored marker', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-hardlink-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const restoredRoot = path.join(dir, 'restored');
  const productionDocumentRoot = path.join(dir, 'public_html');
  fs.mkdirSync(restoredRoot); fs.mkdirSync(productionDocumentRoot);
  const archive = path.join(dir, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive only');
  fs.linkSync(archive, path.join(restoredRoot, 'index.html'));
  assert.throws(() => assertRestoreEvidence({ archive, restoredRoot, productionDocumentRoot,
    marker: 'index.html', expectedArchiveSha256: sha('synthetic archive only'),
    expectedMarkerSha256: sha('synthetic archive only') }), /hard link to archive/);
});

test('unrelated external hard link cannot masquerade as an independently restored marker', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-external-hardlink-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const restoredRoot = path.join(dir, 'restored');
  const productionDocumentRoot = path.join(dir, 'public_html');
  fs.mkdirSync(restoredRoot); fs.mkdirSync(productionDocumentRoot);
  const archive = path.join(dir, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive only');
  const externalSource = path.join(dir, 'unrelated-external-file.txt');
  fs.writeFileSync(externalSource, 'synthetic external source');
  const marker = path.join(restoredRoot, 'index.html');
  fs.linkSync(externalSource, marker);
  assert.throws(() => assertRestoreEvidence({
    archive, restoredRoot, productionDocumentRoot, marker: 'index.html',
    expectedArchiveSha256: sha('synthetic archive only'),
    expectedMarkerSha256: sha('synthetic external source')
  }), /hard-link aliases/);
});
