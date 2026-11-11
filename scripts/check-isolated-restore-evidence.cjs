'use strict';
// Fail-closed local integrity gate for an isolated restore. No network, secrets or production writes.
// This script cannot perform a restore: an operator must restore the archive separately.
const fs = require('node:fs');
const path = require('node:path');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');

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
function canonicalPath(target, label) {
  const absolute = path.resolve(target);
  const real = fs.realpathSync(absolute);
  if (real !== absolute) throw Error(label + ' path must be canonical and contain no symlink aliases');
  return real;
}
function assertRestoreEvidence({ archive, restoredRoot, productionDocumentRoot, marker, expectedArchiveSha256, expectedMarkerSha256 }) {
  if (!/^[a-f0-9]{64}$/i.test(expectedArchiveSha256 || '')) throw Error('expected archive SHA-256 required');
  if (!/^[a-f0-9]{64}$/i.test(expectedMarkerSha256 || '')) throw Error('expected restored marker SHA-256 required');
  for (const [value, label] of [[archive, 'archive'], [restoredRoot, 'restored root'], [productionDocumentRoot, 'production document root']]) {
    if (typeof value !== 'string' || !path.isAbsolute(value)) throw Error(label + ' must be an absolute path');
    rejectSymlinkComponents(value, label);
  }
  const archivePath = canonicalPath(archive, 'archive');
  const root = canonicalPath(restoredRoot, 'restored root');
  const productionRoot = canonicalPath(productionDocumentRoot, 'production document root');
  if (!fs.statSync(productionRoot).isDirectory()) throw Error('production document root must be a directory');
  if (!fs.statSync(root).isDirectory()) throw Error('restored root is not a directory');
  // Both the downloaded archive and the restored tree must be outside the live web root.
  if (!isOutside(productionRoot, root)) throw Error('restored root must be outside production document root');
  if (!isOutside(productionRoot, archivePath)) throw Error('archive must be outside production document root');
  // The source archive must also be outside the isolated restore destination.
  if (!isOutside(root, archivePath)) throw Error('archive must be outside restored root');
  if (typeof marker !== 'string' || path.isAbsolute(marker) || marker.split(/[\\/]/).includes('..')) throw Error('marker must be a relative path inside restored root');
  const markerPath = path.resolve(root, marker);
  if (!markerPath.startsWith(root + path.sep)) throw Error('marker escapes restored root');
  // Reject symlinks at every marker path component, not only the final marker.
  let component = root;
  for (const part of marker.split(/[\\/]/)) {
    if (!part || part === '.') continue;
    component = path.join(component, part);
    if (fs.lstatSync(component).isSymbolicLink()) throw Error('restore marker path must not contain symlinks');
  }
  const realMarker = canonicalPath(markerPath, 'restore marker');
  if (!realMarker.startsWith(root + path.sep)) throw Error('restore marker escapes restored root');

  // Open each file with O_NOFOLLOW, require a single-link regular file, and hash the bytes
  // through the descriptor while checking inode/size/timestamps before and after the read.
  // This closes the previous lstat/readFileSync pathname race for the evidence files.
  const archiveEvidence = readStableRegularFile(archivePath, 'archive');
  const markerEvidence = readStableRegularFile(realMarker, 'restored marker');
  if (archiveEvidence.stat.dev === markerEvidence.stat.dev &&
      archiveEvidence.stat.ino === markerEvidence.stat.ino) {
    throw Error('restored marker must not be a hard link to archive');
  }
  if (archiveEvidence.sha256.toLowerCase() !== expectedArchiveSha256.toLowerCase()) throw Error('archive SHA-256 mismatch');
  if (markerEvidence.sha256.toLowerCase() !== expectedMarkerSha256.toLowerCase()) throw Error('restored marker SHA-256 mismatch');
  return {
    archive_sha256: archiveEvidence.sha256,
    restored_marker_sha256: markerEvidence.sha256,
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
