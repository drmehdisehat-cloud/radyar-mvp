'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('empty archive is rejected despite matching SHA-256 and nonempty restored marker', t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-empty-archive-'));
 t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 const archive = path.join(dir, 'backup.tar.gz'); fs.writeFileSync(archive, '');
 const restoredRoot = path.join(dir, 'restored'); fs.mkdirSync(restoredRoot);
 const marker = path.join(restoredRoot, 'index.html'); fs.writeFileSync(marker, 'synthetic only');
 assert.throws(() => assertRestoreEvidence({
   archive, restoredRoot, marker: 'index.html',
   expectedArchiveSha256: sha(archive), expectedMarkerSha256: sha(marker)
 }), /archive must not be empty/);
});

test('empty restored marker is rejected despite matching SHA-256 and nonempty archive', t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-empty-marker-'));
 t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 const archive = path.join(dir, 'backup.tar.gz'); fs.writeFileSync(archive, 'synthetic archive');
 const restoredRoot = path.join(dir, 'restored'); fs.mkdirSync(restoredRoot);
 const marker = path.join(restoredRoot, 'index.html'); fs.writeFileSync(marker, '');
 assert.throws(() => assertRestoreEvidence({
   archive, restoredRoot, marker: 'index.html',
   expectedArchiveSha256: sha(archive), expectedMarkerSha256: sha(marker)
 }), /restored marker must not be empty/);
});
