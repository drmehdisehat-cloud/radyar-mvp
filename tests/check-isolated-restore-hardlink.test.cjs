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
  fs.mkdirSync(restoredRoot);
  const archive = path.join(dir, 'backup.tar.gz');
  fs.writeFileSync(archive, 'synthetic archive only');
  fs.linkSync(archive, path.join(restoredRoot, 'index.html'));
  assert.throws(() => assertRestoreEvidence({
    archive, restoredRoot, marker: 'index.html',
    expectedArchiveSha256: sha('synthetic archive only'),
    expectedMarkerSha256: sha('synthetic archive only')
  }), /hard link to archive/);
});
