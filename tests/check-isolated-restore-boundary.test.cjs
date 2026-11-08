'use strict';
// Boundary regression: the archive must not reside in the restore tree,
// but a sibling whose name shares the same prefix is a valid separate path.
// All fixtures are synthetic; this does NOT establish a real backup restore.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

test('reject nested archive within restore tree, including deeper subdirectories', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-boundary-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const restoredRoot = path.join(dir, 'restored');
  const nested = path.join(restoredRoot, 'archives', 'daily');
  fs.mkdirSync(nested, { recursive: true });
  const archive = path.join(nested, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive');
  fs.writeFileSync(path.join(restoredRoot, 'index.html'), 'synthetic marker');
  const args = { archive, restoredRoot, marker: 'index.html',
    expectedArchiveSha256: sha('synthetic archive'),
    expectedMarkerSha256: sha('synthetic marker') };
  assert.throws(() => assertRestoreEvidence(args), /archive must be outside restored root/);
});

test('accept sibling archive with shared directory prefix without claiming restore proof', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-sibling-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const restoredRoot = path.join(dir, 'restored');
  const archiveDir = path.join(dir, 'restored-archive');
  fs.mkdirSync(restoredRoot);
  fs.mkdirSync(archiveDir);
  const archive = path.join(archiveDir, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive');
  fs.writeFileSync(path.join(restoredRoot, 'index.html'), 'synthetic marker');
  const evidence = assertRestoreEvidence({ archive, restoredRoot, marker: 'index.html',
    expectedArchiveSha256: sha('synthetic archive'),
    expectedMarkerSha256: sha('synthetic marker') });
  assert.equal(evidence.restore_proven, false);
  assert.equal(evidence.evidence, 'archive-integrity-and-restored-file-only');
});
