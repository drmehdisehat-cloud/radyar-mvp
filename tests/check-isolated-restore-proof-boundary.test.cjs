'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('matching independent synthetic files never count as proof of a successful restore', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-not-proof-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const archive = path.join(dir, 'backup.tar.gz');
  const restoredRoot = path.join(dir, 'isolated');
  fs.mkdirSync(restoredRoot);
  const marker = path.join(restoredRoot, 'index.html');
  fs.writeFileSync(archive, 'synthetic bytes, not a real archive');
  fs.writeFileSync(marker, '<html>synthetic marker</html>');
  const result = assertRestoreEvidence({
    archive, restoredRoot, marker: 'index.html',
    expectedArchiveSha256: sha(archive),
    expectedMarkerSha256: sha(marker)
  });
  assert.equal(result.restore_proven, false);
  assert.equal(result.evidence, 'archive-integrity-and-restored-file-only');
  assert.equal(result.archive_sha256, sha(archive));
  assert.equal(result.restored_marker_sha256, sha(marker));
});

test('altered restored destination is rejected against the independently supplied expected digest', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-tamper-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const archive = path.join(dir, 'backup.tar.gz');
  const restoredRoot = path.join(dir, 'isolated');
  fs.mkdirSync(restoredRoot);
  const marker = path.join(restoredRoot, 'index.html');
  fs.writeFileSync(archive, 'synthetic backup');
  fs.writeFileSync(marker, 'expected synthetic marker');
  const expectedMarkerSha256 = sha(marker);
  fs.writeFileSync(marker, 'tampered synthetic marker');
  assert.throws(() => assertRestoreEvidence({
    archive, restoredRoot, marker: 'index.html',
    expectedArchiveSha256: sha(archive), expectedMarkerSha256
  }), /restored marker SHA-256 mismatch/);
});
