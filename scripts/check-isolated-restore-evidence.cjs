'use strict';
// Fail-closed local integrity gate for an isolated restore. No network, secrets or production writes.
// This script cannot perform a restore: an operator must restore the archive separately.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function rejectSymlinkComponents(target, label) {
  let current = path.resolve(target);
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink()) throw Error(label + ' path must not contain symlinks');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function isOutside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}
function assertRestoreEvidence({ archive, restoredRoot, productionDocumentRoot, marker, expectedArchiveSha256, expectedMarkerSha256 }) {
  if (!/^[a-f0-9]{64}$/i.test(expectedArchiveSha256 || '')) throw Error('expected archive SHA-256 required');
  if (!/^[a-f0-9]{64}$/i.test(expectedMarkerSha256 || '')) throw Error('expected restored marker SHA-256 required');
  for (const [value, label] of [[archive, 'archive'], [restoredRoot, 'restored root'], [productionDocumentRoot, 'production document root']]) {
    if (typeof value !== 'string' || !path.isAbsolute(value)) throw Error(label + ' must be an absolute path');
    rejectSymlinkComponents(value, label);
  }
  const archivePath = fs.realpathSync(archive);
  const root = fs.realpathSync(restoredRoot);
  const productionRoot = fs.realpathSync(productionDocumentRoot);
  if (!fs.statSync(productionRoot).isDirectory()) throw Error('production document root must be a directory');
  if (!fs.statSync(root).isDirectory()) throw Error('restored root is not a directory');
  // Both the downloaded archive and the restored tree must be outside the live web root.
  // A sibling directory is allowed; a nested path or the document root itself is not.
  if (!isOutside(productionRoot, root)) throw Error('restored root must be outside production document root');
  if (!isOutside(productionRoot, archivePath)) throw Error('archive must be outside production document root');
  // The source archive must also be outside the isolated restore destination.
  if (archivePath.startsWith(root + path.sep)) throw Error('archive must be outside restored root');
  if (typeof marker !== 'string' || path.isAbsolute(marker) || marker.split(/[\\/]/).includes('..')) throw Error('marker must be a relative path inside restored root');
  const markerPath = path.resolve(root, marker);
  if (!markerPath.startsWith(root + path.sep)) throw Error('marker escapes restored root');
  // Reject symlinks at every path component, not only the final marker.
  let component = root;
  for (const part of marker.split(/[\\/]/)) {
    if (!part || part === '.') continue;
    component = path.join(component, part);
    if (fs.lstatSync(component).isSymbolicLink()) throw Error('restore marker path must not contain symlinks');
  }
  const realMarker = fs.realpathSync(markerPath);
  if (!realMarker.startsWith(root + path.sep) || !fs.statSync(realMarker).isFile()) throw Error('marker not a regular file within restore');
  // A hard-linked marker is the archive itself, not an independently restored file.
  const archiveStat = fs.statSync(archivePath);
  const markerStat = fs.statSync(realMarker);
  if (archiveStat.size === 0) throw Error('archive must not be empty');
  if (markerStat.size === 0) throw Error('restored marker must not be empty');
  if (archiveStat.dev === markerStat.dev && archiveStat.ino === markerStat.ino)
    throw Error('restored marker must not be a hard link to archive');
  const actual = hash(archivePath);
  if (actual.toLowerCase() !== expectedArchiveSha256.toLowerCase()) throw Error('archive SHA-256 mismatch');
  const markerSha256 = hash(realMarker);
  if (markerSha256.toLowerCase() !== expectedMarkerSha256.toLowerCase()) throw Error('restored marker SHA-256 mismatch');
  return {
    archive_sha256: actual,
    restored_marker_sha256: markerSha256,
    marker,
    production_document_root_realpath: productionRoot,
    restored_root_realpath: root,
    evidence: 'archive-integrity-and-restored-file-only',
    restore_proven: false
  };
}
if (require.main === module) {
  const [archive, restoredRoot, productionDocumentRoot, marker, expectedArchiveSha256, expectedMarkerSha256] = process.argv.slice(2);
  try {
    if (![archive, restoredRoot, productionDocumentRoot, marker, expectedArchiveSha256, expectedMarkerSha256].every(Boolean)) {
      throw Error('Usage: node scripts/check-isolated-restore-evidence.cjs ARCHIVE RESTORED_ROOT PRODUCTION_DOCUMENT_ROOT RELATIVE_MARKER EXPECTED_ARCHIVE_SHA256 EXPECTED_MARKER_SHA256');
    }
    console.log(JSON.stringify(assertRestoreEvidence({ archive, restoredRoot, productionDocumentRoot, marker, expectedArchiveSha256, expectedMarkerSha256 })));
  } catch (error) {
    console.error('NOT_READY:', error.message);
    process.exitCode = 1;
  }
}
module.exports = { assertRestoreEvidence };
