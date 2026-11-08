'use strict';
// Fail-closed local proof gate for an isolated restore. No network, secrets or production writes.
// This script cannot perform a restore: an operator must restore the archive separately.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function assertRestoreEvidence({ archive, restoredRoot, marker, expectedArchiveSha256 }) {
  if (!/^[a-f0-9]{64}$/i.test(expectedArchiveSha256 || '')) throw Error('expected archive SHA-256 required');
  const archivePath = fs.realpathSync(archive);
  const root = fs.realpathSync(restoredRoot);
  const markerPath = path.resolve(root, marker);
  if (path.isAbsolute(marker) || marker.split(/[\\/]/).includes('..')) throw Error('marker must be a relative path inside restored root');
  if (!markerPath.startsWith(root + path.sep)) throw Error('marker escapes restored root');
  if (!fs.statSync(root).isDirectory()) throw Error('restored root is not a directory');
  if (!fs.statSync(archivePath).isFile()) throw Error('archive must be a file');
  if (fs.lstatSync(markerPath).isSymbolicLink()) throw Error('restore marker must not be a symlink');
  const realMarker = fs.realpathSync(markerPath);
  if (!realMarker.startsWith(root + path.sep) || !fs.statSync(realMarker).isFile()) throw Error('marker not a regular file within restore');
  const actual = hash(archivePath);
  if (actual.toLowerCase() !== expectedArchiveSha256.toLowerCase()) throw Error('archive SHA-256 mismatch');
  return { archive_sha256: actual, restored_marker_sha256: hash(realMarker), marker, evidence: 'archive-integrity-and-restored-file-only', restore_proven: false };
}
if (require.main === module) {
  const [archive, restoredRoot, marker, expectedArchiveSha256] = process.argv.slice(2);
  try {
    if (![archive, restoredRoot, marker, expectedArchiveSha256].every(Boolean)) throw Error('Usage: node scripts/check-isolated-restore-evidence.cjs ARCHIVE RESTORED_ROOT RELATIVE_MARKER EXPECTED_ARCHIVE_SHA256');
    console.log(JSON.stringify(assertRestoreEvidence({archive, restoredRoot, marker, expectedArchiveSha256})));
  } catch (e) { console.error('NOT_READY:', e.message); process.exitCode = 1; }
}
module.exports = { assertRestoreEvidence };
