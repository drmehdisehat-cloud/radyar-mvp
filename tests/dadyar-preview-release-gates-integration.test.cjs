'use strict';
// Synthetic integration gate: these fixtures never prove a real restore or release.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');
function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  const digest = crypto.createHash('sha1');
  digest.update(`blob ${bytes.length}\0`);
  digest.update(bytes);
  return digest.digest('hex');
}
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const preview = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; form-action 'none'"><input id="export-ack"><button id="download" disabled>Download</button>`;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-release-gate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const archive = path.join(dir, 'backup.tar.gz');
  const root = path.join(dir, 'isolated-restore');
  const sourceDir = path.join(dir, 'reviewed-source');
  const destinationDir = path.join(dir, 'dadyar-preview');
  const productionRoot = path.join(dir, 'production-root');
  for (const d of [root, sourceDir, destinationDir, productionRoot]) fs.mkdirSync(d);
  fs.writeFileSync(archive, 'synthetic archive, not a real backup');
  fs.writeFileSync(path.join(root, 'index.html'), 'synthetic restored marker');
  const source = path.join(sourceDir, 'index.html');
  const destination = path.join(destinationDir, 'index.html');
  fs.writeFileSync(source, preview);
  fs.writeFileSync(destination, preview);
  const expectedSourceBlobSha = gitBlobSha(source);
  const restoreArgs = { archive, restoredRoot: root, productionDocumentRoot: productionRoot,
    marker: 'index.html', expectedArchiveSha256: sha(fs.readFileSync(archive)),
    expectedMarkerSha256: sha(fs.readFileSync(path.join(root, 'index.html'))) };
  return { restoreArgs, source, destination, productionRoot, expectedSourceBlobSha };
}
test('synthetic gates both pass, but never claim restore proof', t => {
  const f = fixture(t);
  const restore = assertRestoreEvidence(f.restoreArgs);
  const deployed = verifyPreview(f.source, f.destination, f.productionRoot, f.expectedSourceBlobSha);
  assert.equal(restore.restore_proven, false);
  assert.equal(deployed.matched, true);
  assert.equal(deployed.source_sha256, deployed.destination_sha256);
});
test('valid destination cannot compensate for mismatched backup evidence', t => {
  const f = fixture(t);
  assert.equal(verifyPreview(f.source, f.destination, f.productionRoot, f.expectedSourceBlobSha).matched, true);
  assert.throws(() => assertRestoreEvidence({ ...f.restoreArgs,
    expectedArchiveSha256: sha('wrong archive') }), /archive SHA-256 mismatch/);
});
test('valid backup evidence cannot compensate for modified deployed HTML', t => {
  const f = fixture(t);
  assert.equal(assertRestoreEvidence(f.restoreArgs).restore_proven, false);
  fs.appendFileSync(f.destination, '<!-- modified -->');
  assert.throws(() => verifyPreview(f.source, f.destination, f.productionRoot, f.expectedSourceBlobSha),
    /destination differs from reviewed source/);
});
