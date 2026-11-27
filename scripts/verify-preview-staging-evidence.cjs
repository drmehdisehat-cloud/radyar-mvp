'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

function fail(code) { throw new Error(code); }
function isHex(value, length) { return typeof value === 'string' && new RegExp('^[a-f0-9]{' + length + '}$').test(value); }
function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
function overlaps(a, b) { return isWithin(a, b) || isWithin(b, a); }
function assertCanonicalExistingPath(value, label, kind) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) fail(label + '_path_must_be_absolute_canonical');
  const root = path.parse(value).root;
  let current = root;
  const parts = path.relative(root, value).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(label + '_symlink_forbidden');
    if (i < parts.length - 1 && !stat.isDirectory()) fail(label + '_parent_not_directory');
  }
  if (fs.realpathSync(value) !== value) fail(label + '_path_not_canonical');
  const stat = fs.statSync(value);
  if (kind === 'directory' && !stat.isDirectory()) fail(label + '_not_directory');
  if (kind === 'file' && !stat.isFile()) fail(label + '_not_regular_file');
  return value;
}
function assertNoSymlinkComponents(filePath, label) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || path.resolve(filePath) !== filePath) {
    fail(label + '_path_must_be_absolute_canonical');
  }
  const root = path.parse(filePath).root;
  let current = root;
  const parts = path.relative(root, filePath).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(label + '_symlink_forbidden');
    if (i < parts.length - 1 && !stat.isDirectory()) fail(label + '_parent_not_directory');
  }
  if (fs.realpathSync(filePath) !== filePath) fail(label + '_path_not_canonical');
}

function openRegularFileNoFollow(filePath, label) {
  if (typeof fs.constants.O_NOFOLLOW !== 'number') fail(label + '_nofollow_unavailable');
  assertNoSymlinkComponents(filePath, label);
  const before = fs.lstatSync(filePath);
  if (!before.isFile()) fail(label + '_not_regular_file');
  if (before.nlink !== 1) fail(label + '_hardlink_forbidden');
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) {
      fail(label + '_file_changed_during_open');
    }
    assertNoSymlinkComponents(filePath, label);
    const after = fs.lstatSync(filePath);
    if (after.isSymbolicLink() || after.dev !== opened.dev || after.ino !== opened.ino || after.nlink !== 1) {
      fail(label + '_file_changed_during_open');
    }
    return { fd, stat: opened };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function assertFilePathStillMatches(filePath, label, openedStat, fd) {
  const currentFdStat = fs.fstatSync(fd);
  const currentPathStat = fs.lstatSync(filePath);
  if (!currentFdStat.isFile() || !currentPathStat.isFile() || currentPathStat.isSymbolicLink() ||
      currentFdStat.dev !== openedStat.dev || currentFdStat.ino !== openedStat.ino ||
      currentFdStat.size !== openedStat.size || currentFdStat.mtimeMs !== openedStat.mtimeMs ||
      currentFdStat.ctimeMs !== openedStat.ctimeMs || currentFdStat.nlink !== 1 ||
      currentPathStat.dev !== openedStat.dev || currentPathStat.ino !== openedStat.ino ||
      currentPathStat.nlink !== 1) {
    fail(label + '_file_changed_during_read');
  }
  assertNoSymlinkComponents(filePath, label);
}

function readRegularFileNoFollow(filePath, label, encoding = null, maxBytes = null) {
  const opened = openRegularFileNoFollow(filePath, label);
  try {
    if (maxBytes !== null && opened.stat.size > maxBytes) fail(label + '_too_large');
    const bytes = fs.readFileSync(opened.fd);
    if (maxBytes !== null && bytes.length > maxBytes) fail(label + '_too_large');
    assertFilePathStillMatches(filePath, label, opened.stat, opened.fd);
    return encoding ? bytes.toString(encoding) : bytes;
  } finally {
    fs.closeSync(opened.fd);
  }
}


const MAX_PREVIEW_ARCHIVE_BYTES = 10 * 1024 * 1024;
const MAX_PREVIEW_MEMBER_BYTES = 2 * 1024 * 1024;
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[n] = value >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function readPreviewZipMembers(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > MAX_PREVIEW_ARCHIVE_BYTES) fail('preview_artifact_zip_size_invalid');
  let endOffset = -1;
  const lowerBound = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= lowerBound; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) fail('preview_artifact_zip_eocd_missing');
  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount ||
      entryCount < 1 || entryCount > 8 || entryCount === 0xffff ||
      centralSize === 0xffffffff || centralOffset === 0xffffffff ||
      centralOffset + centralSize !== endOffset) fail('preview_artifact_zip_layout_unsupported');
  const allowedNames = ['INTEGRITY.json', 'index.html'];
  const members = new Map();
  const ranges = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) fail('preview_artifact_zip_central_directory_invalid');
    const madeBy = bytes.readUInt16LE(cursor + 4) >>> 8;
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const startDisk = bytes.readUInt16LE(cursor + 34);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > endOffset || nameLength === 0 || startDisk !== 0 ||
        compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      fail('preview_artifact_zip_entry_layout_invalid');
    }
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0 || (flags & 0x2000) !== 0) fail('preview_artifact_zip_encryption_forbidden');
    if (method !== 0 && method !== 8) fail('preview_artifact_zip_compression_unsupported');
    if (compressedSize > MAX_PREVIEW_ARCHIVE_BYTES || uncompressedSize > MAX_PREVIEW_MEMBER_BYTES) fail('preview_artifact_member_too_large');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString('utf8');
    if (!Buffer.from(name, 'utf8').equals(nameBytes) || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      fail('preview_artifact_member_path_invalid');
    }
    if (members.has(name)) fail('preview_artifact_member_duplicate');
    if (madeBy === 3) {
      const unixMode = externalAttributes >>> 16;
      if ((unixMode & 0o170000) !== 0o100000) fail('preview_artifact_member_not_regular_file');
    } else if ((externalAttributes & 0x10) !== 0) {
      fail('preview_artifact_member_not_regular_file');
    }
    if (localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) fail('preview_artifact_zip_local_header_invalid');
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (localFlags !== flags || localMethod !== method || localNameLength !== nameLength ||
        localNameEnd > centralOffset || dataStart > centralOffset || dataEnd > centralOffset ||
        !bytes.subarray(localNameStart, localNameEnd).equals(nameBytes)) fail('preview_artifact_zip_local_header_mismatch');
    if ((flags & 0x0008) === 0) {
      if (bytes.readUInt32LE(localOffset + 14) !== expectedCrc ||
          bytes.readUInt32LE(localOffset + 18) !== compressedSize ||
          bytes.readUInt32LE(localOffset + 22) !== uncompressedSize) fail('preview_artifact_zip_local_size_mismatch');
    }
    let rangeEnd = dataEnd;
    if ((flags & 0x0008) !== 0) {
      let descriptor = dataEnd;
      if (descriptor + 4 <= centralOffset && bytes.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
      if (descriptor + 12 > centralOffset ||
          bytes.readUInt32LE(descriptor) !== expectedCrc ||
          bytes.readUInt32LE(descriptor + 4) !== compressedSize ||
          bytes.readUInt32LE(descriptor + 8) !== uncompressedSize) fail('preview_artifact_zip_data_descriptor_invalid');
      rangeEnd = descriptor + 12;
    }
    ranges.push({ start: localOffset, end: rangeEnd });
    const compressed = bytes.subarray(dataStart, dataEnd);
    let content;
    try {
      content = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_PREVIEW_MEMBER_BYTES });
    } catch {
      fail('preview_artifact_member_decompression_failed');
    }
    if (content.length !== uncompressedSize || crc32(content) !== expectedCrc) fail('preview_artifact_member_crc_or_size_mismatch');
    members.set(name, content);
    cursor = recordEnd;
  }
  if (cursor !== centralOffset + centralSize) fail('preview_artifact_zip_central_directory_size_mismatch');
  const actualNames = Array.from(members.keys()).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(allowedNames)) fail('preview_artifact_member_set_mismatch');
  ranges.sort((a, b) => a.start - b.start);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start < ranges[index - 1].end) fail('preview_artifact_zip_member_overlap');
  }
  return members;
}

function requireStrictlyWithin(child, parent, code) {
  if (child === parent || !isWithin(child, parent)) fail(code);
}
function assertTimestamp(value, label) {
  const match = typeof value === 'string'
    ? /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,9}))?(Z|([+-])(\\d{2}):(\\d{2}))$/.exec(value)
    : null;
  if (!match) fail(label + '_invalid_timestamp');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month < 1 || month > 12 || day < 1 || day > monthLengths[month - 1] ||
      hour > 23 || minute > 59 || second > 59) {
    fail(label + '_invalid_timestamp');
  }

  if (match[8] !== 'Z') {
    const offsetHour = Number(match[10]);
    const offsetMinute = Number(match[11]);
    if (offsetHour > 23 || offsetMinute > 59 ||
        (match[9] === '-' && offsetHour === 0 && offsetMinute === 0)) {
      fail(label + '_invalid_timestamp');
    }
  }

  if (!Number.isFinite(Date.parse(value))) fail(label + '_invalid_timestamp');
}
function assertNoSecrets(value, location) {
  const where = location || 'root';
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, where + '[' + index + ']'));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}/.test(value)) fail('secret_material_forbidden:' + where);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/(?:password|passwd|token|secret|private.?key|api.?key|credential|authorization|cookie)/i.test(key)) fail('sensitive_field_forbidden:' + where + '.' + key);
    assertNoSecrets(child, where + '.' + key);
  }
}
function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + '_must_be_object');
  const actual = Object.keys(value).sort();
  const allowed = expected.slice().sort();
  if (JSON.stringify(actual) !== JSON.stringify(allowed)) fail(label + '_fields_mismatch');
}
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
}
function sha256File(filePath, label = 'file') {
  return new Promise((resolve, reject) => {
    let opened;
    try { opened = openRegularFileNoFollow(filePath, label); }
    catch (error) { reject(error); return; }
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(null, { fd: opened.fd, autoClose: false });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      try { fs.closeSync(opened.fd); } catch {}
      if (error) reject(error);
      else resolve(value);
    };
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', error => finish(error));
    stream.on('end', () => {
      try {
        assertFilePathStillMatches(filePath, label, opened.stat, opened.fd);
        finish(null, hash.digest('hex'));
      } catch (error) {
        finish(error);
      }
    });
  });
}
function publicKeyFingerprint(key) {
  const publicKey = key && key.type === 'public' ? key : crypto.createPublicKey(key);
  if (publicKey.asymmetricKeyType !== 'ed25519') fail('attestation_key_must_be_ed25519');
  return crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
}
function verifyAttestation(role, attestation, keyPath, expectedFingerprint, signedBytes) {
  if (!attestation || !isHex(attestation.keyFingerprint, 64) || typeof attestation.signatureBase64 !== 'string') fail(role + '_attestation_missing');
  if (!keyPath || !expectedFingerprint || !isHex(expectedFingerprint, 64)) fail(role + '_trusted_key_configuration_missing');
  const publicKey = crypto.createPublicKey(readRegularFileNoFollow(keyPath, role + '_key'));
  if (publicKey.asymmetricKeyType !== 'ed25519') fail(role + '_key_must_be_ed25519');
  const actualFingerprint = publicKeyFingerprint(publicKey);
  if (actualFingerprint !== expectedFingerprint || attestation.keyFingerprint !== expectedFingerprint) fail(role + '_trusted_key_fingerprint_mismatch');
  const signature = Buffer.from(attestation.signatureBase64, 'base64');
  if (signature.length !== 64 || signature.toString('base64') !== attestation.signatureBase64) fail(role + '_signature_encoding_invalid');
  if (!crypto.verify(null, signedBytes, publicKey, signature)) fail(role + '_signature_invalid');
  return actualFingerprint;
}
async function verifyEvidence(evidence, options) {
  if (!evidence || typeof evidence !== 'object' || !evidence.payload || !evidence.attestations) fail('evidence_envelope_invalid');
  assertNoSecrets(evidence);
  assertExactKeys(evidence, ['payload', 'attestations'], 'evidence');
  const payload = evidence.payload;
  assertExactKeys(payload, ['schemaVersion', 'sourceCommit', 'environment', 'backup', 'previewArtifact', 'databaseProbe', 'destination'], 'payload');
  if (payload.schemaVersion !== 1) fail('evidence_schema_version_unsupported');
  if (!isHex(payload.sourceCommit, 40)) fail('source_commit_invalid');

  // Authenticate the canonical payload before opening any evidence-supplied filesystem path.
  const attestations = evidence.attestations;
  assertExactKeys(attestations, ['operator', 'reviewer'], 'attestations');
  assertExactKeys(attestations.operator, ['keyFingerprint', 'signatureBase64'], 'operator_attestation');
  assertExactKeys(attestations.reviewer, ['keyFingerprint', 'signatureBase64'], 'reviewer_attestation');
  const signedBytes = Buffer.from(canonicalize(payload), 'utf8');
  const operatorFingerprint = verifyAttestation('operator', attestations.operator, options.operatorPublicKeyPath, options.operatorFingerprint, signedBytes);
  const reviewerFingerprint = verifyAttestation('reviewer', attestations.reviewer, options.reviewerPublicKeyPath, options.reviewerFingerprint, signedBytes);
  if (operatorFingerprint === reviewerFingerprint) fail('operator_and_reviewer_must_be_distinct');


  const environment = payload.environment || {};
  assertExactKeys(environment, ['kind', 'stagingRoot', 'productionDocumentRoot', 'repositoryRoot'], 'environment');
  const stagingRoot = assertCanonicalExistingPath(environment.stagingRoot, 'staging_root', 'directory');
  const productionRoot = assertCanonicalExistingPath(environment.productionDocumentRoot, 'production_document_root', 'directory');
  const repositoryRoot = assertCanonicalExistingPath(environment.repositoryRoot, 'repository_root', 'directory');
  if (environment.kind !== 'isolated-staging') fail('environment_must_be_isolated_staging');
  if (overlaps(stagingRoot, productionRoot)) fail('staging_root_overlaps_production_document_root');
  if (overlaps(stagingRoot, repositoryRoot)) fail('staging_root_overlaps_repository_checkout');
  if (overlaps(productionRoot, repositoryRoot)) fail('production_document_root_overlaps_repository_checkout');

  const backup = payload.backup || {};
  assertExactKeys(backup, ['archivePath', 'sha256', 'restoreRoot', 'sentinelPath', 'sentinelSha256', 'restoreExitCode', 'restoreCompletedAt'], 'backup');
  if (backup.restoreExitCode !== 0) fail('backup_restore_exit_code_not_zero');
  assertTimestamp(backup.restoreCompletedAt, 'backup_restore');
  const archivePath = assertCanonicalExistingPath(backup.archivePath, 'backup_archive', 'file');
  if (overlaps(archivePath, stagingRoot) || overlaps(archivePath, productionRoot) || overlaps(archivePath, repositoryRoot)) fail('backup_archive_inside_protected_path');
  const archiveHash = await sha256File(archivePath, 'backup_archive');
  if (!isHex(backup.sha256, 64) || archiveHash !== backup.sha256) fail('backup_archive_sha256_mismatch');
  const restoreRoot = assertCanonicalExistingPath(backup.restoreRoot, 'restore_root', 'directory');
  requireStrictlyWithin(restoreRoot, stagingRoot, 'restore_root_outside_staging');
  const sentinelPath = assertCanonicalExistingPath(backup.sentinelPath, 'restore_sentinel', 'file');
  requireStrictlyWithin(sentinelPath, restoreRoot, 'restore_sentinel_outside_restore_root');
  const sentinelStat = fs.lstatSync(sentinelPath);
  if (!sentinelStat.isFile() || sentinelStat.nlink !== 1) fail('restore_sentinel_hardlink_forbidden');
  if (!isHex(backup.sentinelSha256, 64) || await sha256File(sentinelPath, 'restore_sentinel') !== backup.sentinelSha256) fail('restore_sentinel_sha256_mismatch');

  const previewArtifact = payload.previewArtifact || {};
  assertExactKeys(previewArtifact, ['archivePath', 'sha256'], 'preview_artifact');
  const artifactPath = assertCanonicalExistingPath(previewArtifact.archivePath, 'preview_artifact', 'file');
  if (overlaps(artifactPath, stagingRoot) || overlaps(artifactPath, productionRoot) || overlaps(artifactPath, repositoryRoot)) fail('preview_artifact_inside_protected_path');
  const artifactBytes = readRegularFileNoFollow(artifactPath, 'preview_artifact', null, MAX_PREVIEW_ARCHIVE_BYTES);
  const artifactHash = crypto.createHash('sha256').update(artifactBytes).digest('hex');
  if (!isHex(previewArtifact.sha256, 64) || artifactHash !== previewArtifact.sha256) fail('preview_artifact_sha256_mismatch');
  const previewMembers = readPreviewZipMembers(artifactBytes);

  const probe = payload.databaseProbe || {};
  assertExactKeys(probe, ['success', 'query', 'value', 'stagingFingerprint', 'productionFingerprint', 'testedAt'], 'database_probe');
  if (probe.success !== true || probe.query !== 'SELECT 1' || probe.value !== 1) fail('staging_database_probe_failed');
  assertTimestamp(probe.testedAt, 'database_probe');
  if (Date.parse(probe.testedAt) <= Date.parse(backup.restoreCompletedAt)) fail('database_probe_must_follow_restore_completion');
  if (!isHex(probe.stagingFingerprint, 64) || !isHex(probe.productionFingerprint, 64)) fail('database_fingerprint_invalid');
  if (probe.stagingFingerprint === probe.productionFingerprint) fail('staging_database_matches_production');

  const destination = payload.destination || {};
  assertExactKeys(destination, ['directoryPath', 'files'], 'destination');
  const destinationRoot = assertCanonicalExistingPath(destination.directoryPath, 'destination_root', 'directory');
  requireStrictlyWithin(destinationRoot, stagingRoot, 'destination_outside_staging');
  if (path.basename(destinationRoot) !== 'dadyar-preview') fail('destination_leaf_must_be_dadyar_preview');
  if (overlaps(destinationRoot, restoreRoot)) fail('destination_overlaps_restore_tree');
  if (overlaps(destinationRoot, productionRoot) || overlaps(destinationRoot, repositoryRoot)) fail('destination_overlaps_protected_path');
  const expectedNames = ['INTEGRITY.json', 'index.html'];
  const actualNames = fs.readdirSync(destinationRoot).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) fail('destination_file_set_mismatch');
  if (!Array.isArray(destination.files) || destination.files.length !== 2) fail('destination_manifest_file_list_invalid');
  const listedNames = destination.files.map(item => item && item.name).sort();
  if (JSON.stringify(listedNames) !== JSON.stringify(expectedNames)) fail('destination_manifest_file_set_mismatch');

  const fileHashes = {};
  for (const item of destination.files) {
    assertExactKeys(item, ['name', 'sha256'], 'destination_file');
    if (!isHex(item.sha256, 64)) fail('destination_expected_sha256_invalid:' + item.name);
    const filePath = assertCanonicalExistingPath(path.join(destinationRoot, item.name), 'destination_file_' + item.name, 'file');
    requireStrictlyWithin(filePath, destinationRoot, 'destination_file_outside_destination');
    const destinationStat = fs.lstatSync(filePath);
    if (!destinationStat.isFile() || destinationStat.nlink !== 1) fail('destination_file_hardlink_forbidden:' + item.name);
    const actualHash = await sha256File(filePath, 'destination_file_' + item.name);
    if (actualHash !== item.sha256) fail('destination_file_sha256_mismatch:' + item.name);
    fileHashes[item.name] = actualHash;
  }
  for (const name of expectedNames) {
    const member = previewMembers.get(name);
    if (!member || crypto.createHash('sha256').update(member).digest('hex') !== fileHashes[name]) {
      fail('preview_artifact_member_sha256_mismatch:' + name);
    }
  }

  let manifest;
  try { manifest = JSON.parse(readRegularFileNoFollow(path.join(destinationRoot, 'INTEGRITY.json'), 'destination_integrity_manifest', 'utf8')); }
  catch { fail('destination_integrity_manifest_invalid_json'); }
  if (manifest.schemaVersion !== 1 || manifest.sourceCommit !== payload.sourceCommit || manifest.workflowCommit !== payload.sourceCommit) fail('destination_manifest_source_commit_mismatch');
  if (manifest.route !== '/dadyar-preview/' || !Array.isArray(manifest.files) || JSON.stringify(manifest.files.slice().sort()) !== JSON.stringify(expectedNames)) fail('destination_manifest_route_or_file_set_mismatch');
  if (manifest.htmlSha256 !== fileHashes['index.html']) fail('destination_manifest_html_hash_mismatch');
  const release = manifest.release || {};
  if (release.status !== 'NOT_READY' || release.apiEnabled !== false || release.publicAiEnabled !== false || release.reviewerAuthentication !== 'not-configured' || release.deploymentAuthorized !== false || release.backupRestoreVerified !== false || release.destinationVerified !== false) fail('review_artifact_release_boundary_invalid');


  return {
    status: 'EVIDENCE_MATCHED_NOT_RELEASE_AUTHORIZED',
    keyFingerprintsPinned: true,
    signerIdentityIndependentlyVerified: false,
    restoreOperationIndependentlyVerified: false,
    deploymentAuthorized: false,
    sourceCommit: payload.sourceCommit,
    backupSha256: archiveHash,
    previewArtifactSha256: previewArtifact.sha256,
    previewArtifactMembersVerified: true,
    destinationFiles: expectedNames,
    destinationSha256: fileHashes,
    operatorFingerprint,
    reviewerFingerprint
  };
}
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) { positional.push(value); continue; }
    const key = value.slice(2);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail('missing_argument_for_' + key);
    flags[key] = argv[++i];
  }
  return { positional, flags };
}
async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const evidencePath = parsed.positional[0];
  if (!evidencePath || parsed.positional.length !== 1) fail('usage: node verify-preview-staging-evidence.cjs evidence.json --operator-public-key FILE --operator-fingerprint SHA256 --reviewer-public-key FILE --reviewer-fingerprint SHA256');
  const evidenceFile = assertCanonicalExistingPath(evidencePath, 'evidence_file', 'file');
  const evidence = JSON.parse(readRegularFileNoFollow(evidenceFile, 'evidence_file', 'utf8'));
  const result = await verifyEvidence(evidence, {
    operatorPublicKeyPath: parsed.flags['operator-public-key'],
    operatorFingerprint: parsed.flags['operator-fingerprint'],
    reviewerPublicKeyPath: parsed.flags['reviewer-public-key'],
    reviewerFingerprint: parsed.flags['reviewer-fingerprint']
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (require.main === module) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({ status: 'NOT_VERIFIED', reason: error.message }) + '\n');
    process.exitCode = 2;
  });
}
module.exports = { verifyEvidence, canonicalize, publicKeyFingerprint };
