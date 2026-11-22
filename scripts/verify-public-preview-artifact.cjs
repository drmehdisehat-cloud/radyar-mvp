'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { parseJsonRejectDuplicateKeys } = require('./strict-json.cjs');

const EXPECTED_NAMES = ['INTEGRITY.json', 'index.html'];
const EXPECTED_MANIFEST_KEYS = [
  'schema', 'source_commit', 'workflow_commit', 'source_branch', 'source_file',
  'target_subpath', 'sha256', 'git_blob_sha1', 'topic_hint_count', 'api_enabled',
  'public_ai_enabled', 'reviewer_authentication', 'backup_restore_verified',
  'destination_verified', 'deployment_authorized', 'notice'
].sort();
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_BYTES = 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 1000;
const REPO_ROOT = path.resolve(__dirname, '..');

function fail(condition, message) {
  if (!condition) throw new Error(message);
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function gitBlobSha1(bytes) {
  const hash = crypto.createHash('sha1');
  hash.update(Buffer.from('blob ' + bytes.length + '\0', 'ascii'));
  hash.update(bytes);
  return hash.digest('hex');
}
function safeRead(buffer, offset, length, label) {
  fail(Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= buffer.length,
    'zip_' + label + '_out_of_bounds');
}
function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 22 - 65535);
  for (let offset = buffer.length - 22; offset >= minimum; offset--) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw new Error('zip_end_of_central_directory_missing');
}
function parseZip(buffer) {
  fail(Buffer.isBuffer(buffer), 'archive_buffer_required');
  fail(buffer.length >= 22 && buffer.length <= MAX_ARCHIVE_BYTES, 'archive_size_out_of_bounds');
  const eocd = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  fail(disk === 0 && centralDisk === 0 && entriesOnDisk === entryCount, 'zip_multi_disk_not_supported');
  fail(entryCount === 2 && entryCount !== 0xffff && centralSize !== 0xffffffff && centralOffset !== 0xffffffff,
    'zip_entry_count_or_zip64_not_supported');
  fail(centralOffset + centralSize === eocd, 'zip_central_directory_bounds_invalid');
  safeRead(buffer, centralOffset, centralSize, 'central_directory');
  const entries = new Map();
  const localRanges = [];
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index++) {
    safeRead(buffer, cursor, 46, 'central_header');
    fail(buffer.readUInt32LE(cursor) === 0x02014b50, 'zip_central_header_signature_invalid');
    const versionMadeBy = buffer.readUInt16LE(cursor + 4);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const diskStart = buffer.readUInt16LE(cursor + 34);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const headerLength = 46 + nameLength + extraLength + commentLength;
    safeRead(buffer, cursor, headerLength, 'central_entry');
    fail(diskStart === 0 && compressedSize !== 0xffffffff && uncompressedSize !== 0xffffffff && localOffset !== 0xffffffff,
      'zip_entry_zip64_or_multi_disk_not_supported');
    fail(extraLength === 0 && commentLength === 0, 'zip_unexpected_central_metadata_rejected');
    fail((flags & 0x0001) === 0 && (flags & 0x0040) === 0, 'zip_encrypted_entry_rejected');
    fail((flags & 0x2000) === 0, 'zip_masked_header_entry_rejected');
    fail(method === 0 || method === 8, 'zip_compression_method_not_supported');
    fail(uncompressedSize <= MAX_ENTRY_BYTES, 'zip_entry_uncompressed_size_exceeded');
    totalUncompressed += uncompressedSize;
    fail(totalUncompressed <= MAX_TOTAL_UNCOMPRESSED_BYTES, 'zip_total_uncompressed_size_exceeded');
    fail(compressedSize > 0 || uncompressedSize === 0, 'zip_invalid_empty_compressed_entry');
    if (compressedSize > 0) fail(uncompressedSize / compressedSize <= MAX_COMPRESSION_RATIO, 'zip_compression_ratio_exceeded');
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString('utf8');
    fail(Buffer.from(name, 'utf8').equals(nameBytes), 'zip_filename_invalid_utf8');
    fail(name.length > 0 && !name.includes('\0') && !name.includes('/') && !name.includes('\\') &&
      !name.startsWith('.') && !/^[A-Za-z]:/.test(name), 'zip_unsafe_entry_path');
    fail(EXPECTED_NAMES.includes(name), 'zip_unexpected_entry:' + name);
    fail(!entries.has(name), 'zip_duplicate_entry:' + name);
    const creatorOs = versionMadeBy >>> 8;
    const unixMode = externalAttributes >>> 16;
    const fileType = unixMode & 0xf000;
    const dosAttributes = externalAttributes & 0xff;
    if (creatorOs === 3 && unixMode !== 0) fail(fileType === 0x8000, 'zip_non_regular_file_rejected');
    fail((dosAttributes & 0x10) === 0, 'zip_directory_entry_rejected');
    safeRead(buffer, localOffset, 30, 'local_header');
    fail(localOffset < centralOffset && buffer.readUInt32LE(localOffset) === 0x04034b50,
      'zip_local_header_signature_invalid');
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localCrc = buffer.readUInt32LE(localOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(localOffset + 18);
    const localUncompressedSize = buffer.readUInt32LE(localOffset + 22);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    fail(localExtraLength === 0, 'zip_unexpected_local_metadata_rejected');
    fail(localFlags === flags && localMethod === method, 'zip_local_central_header_mismatch');
    fail(localNameLength === nameLength, 'zip_local_filename_length_mismatch');
    safeRead(buffer, localOffset + 30, localNameLength + localExtraLength, 'local_name_extra');
    const localName = buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    fail(localName.equals(nameBytes), 'zip_local_filename_mismatch');
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    safeRead(buffer, dataOffset, compressedSize, 'entry_data');
    const dataEnd = dataOffset + compressedSize;
    fail(dataEnd <= centralOffset, 'zip_entry_data_overlaps_central_directory');
    const usesDescriptor = (flags & 0x0008) !== 0;
    if (usesDescriptor) {
      fail(localCrc === 0 || localCrc === expectedCrc, 'zip_local_crc_mismatch');
      fail(localCompressedSize === 0 || localCompressedSize === compressedSize, 'zip_local_compressed_size_mismatch');
      fail(localUncompressedSize === 0 || localUncompressedSize === uncompressedSize, 'zip_local_uncompressed_size_mismatch');
    } else {
      fail(localCrc === expectedCrc && localCompressedSize === compressedSize && localUncompressedSize === uncompressedSize,
        'zip_local_central_size_or_crc_mismatch');
    }
    let descriptorEnd = dataEnd;
    if (usesDescriptor) {
      let descriptorOffset = dataEnd;
      if (descriptorOffset + 4 <= centralOffset && buffer.readUInt32LE(descriptorOffset) === 0x08074b50) descriptorOffset += 4;
      safeRead(buffer, descriptorOffset, 12, 'data_descriptor');
      fail(buffer.readUInt32LE(descriptorOffset) === expectedCrc &&
        buffer.readUInt32LE(descriptorOffset + 4) === compressedSize &&
        buffer.readUInt32LE(descriptorOffset + 8) === uncompressedSize, 'zip_data_descriptor_mismatch');
      descriptorEnd = descriptorOffset + 12;
    }
    fail(descriptorEnd <= centralOffset, 'zip_data_descriptor_overlaps_central_directory');
    const compressed = buffer.subarray(dataOffset, dataEnd);
    let content;
    try {
      content = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
    } catch {
      throw new Error('zip_entry_decompression_failed:' + name);
    }
    fail(content.length === uncompressedSize, 'zip_uncompressed_size_mismatch:' + name);
    fail(crc32(content) === expectedCrc, 'zip_crc32_mismatch:' + name);
    entries.set(name, content);
    localRanges.push({ start: localOffset, end: descriptorEnd });
    cursor += headerLength;
  }
  fail(cursor === eocd, 'zip_central_directory_trailing_data');
  fail(EXPECTED_NAMES.every(name => entries.has(name)), 'zip_required_entry_missing');
  localRanges.sort((a, b) => a.start - b.start);
  fail(localRanges[0].start === 0, 'zip_unreferenced_prefix_rejected');
  for (let index = 1; index < localRanges.length; index++) {
    fail(localRanges[index].start === localRanges[index - 1].end, 'zip_unreferenced_local_gap_or_overlap_rejected');
  }
  fail(localRanges[localRanges.length - 1].end === centralOffset, 'zip_unreferenced_local_data_rejected');
  return entries;
}
function verifyHtml(htmlBytes) {
  const html = htmlBytes.toString('utf8');
  fail(Buffer.from(html, 'utf8').equals(htmlBytes), 'preview_html_invalid_utf8');
  fail(/<html\s+lang="fa"\s+dir="rtl"/i.test(html), 'preview_must_be_persian_rtl');
  fail(/<meta\s+name="robots"\s+content="noindex,nofollow,noarchive"/i.test(html), 'preview_must_be_noindex');
  fail(/default-src\s+'none'/i.test(html) && /connect-src\s+'none'/i.test(html), 'preview_network_csp_missing');
  fail(/چک فرضی/.test(html) && /اطلاعات واقعی وارد نکنید/.test(html), 'synthetic_data_notice_missing');
  fail(/id="free-question"/.test(html), 'free_question_input_missing');
  fail(/نقش‌های وکیل، قاضی، دادستان، ضابط و سردفتر[\s\S]{0,180}شبیه‌سازی/.test(html), 'role_simulation_disclosure_missing');
  fail(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/i.test(html), 'network_api_code_detected');
  fail(!/<form\b/i.test(html), 'network_form_detected');
  fail(!/<(?:script|link|iframe|img|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*['"]?\s*(?:https?:|\/\/)/i.test(html),
    'external_html_resource_detected');
  fail(!/@import\s+url\s*\(/i.test(html) && !/url\(\s*['"]?https?:/i.test(html), 'external_css_resource_detected');
  const topicHints = html.match(/const topicHints = \[([\s\S]*?)\n\];/);
  fail(Boolean(topicHints), 'topic_hints_missing');
  const topicCount = (topicHints[1].match(/"id"\s*:/g) || []).length;
  fail(topicCount === 27, 'topic_hint_count_mismatch');
  return { topicCount };
}
function verifyArtifactBuffer(buffer, expectedCommit) {
  fail(typeof expectedCommit === 'string' && /^[a-f0-9]{40}$/i.test(expectedCommit) && !/^0{40}$/i.test(expectedCommit),
    'expected_source_commit_required');
  const entries = parseZip(buffer);
  const htmlBytes = entries.get('index.html');
  const manifestBytes = entries.get('INTEGRITY.json');
  const { topicCount } = verifyHtml(htmlBytes);
  const manifestText = manifestBytes.toString('utf8');
  fail(Buffer.from(manifestText, 'utf8').equals(manifestBytes), 'manifest_invalid_utf8');
  let manifest;
  try { manifest = parseJsonRejectDuplicateKeys(manifestText); }
  catch (error) { throw new Error('manifest_invalid_json:' + error.message); }
  fail(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest_object_required');
  fail(JSON.stringify(Object.keys(manifest).sort()) === JSON.stringify(EXPECTED_MANIFEST_KEYS), 'manifest_schema_keys_mismatch');
  fail(manifest.schema === 'dadyar-public-preview-integrity-v1', 'manifest_schema_mismatch');
  fail(manifest.source_commit === expectedCommit && manifest.workflow_commit === expectedCommit, 'manifest_commit_mismatch');
  fail(manifest.source_branch === 'dadyar/ai-chat-private-20261101', 'manifest_branch_mismatch');
  fail(manifest.source_file === 'public/index.html' && manifest.target_subpath === '/dadyar-preview/', 'manifest_source_or_target_mismatch');
  fail(manifest.sha256 === sha256(htmlBytes), 'manifest_html_sha256_mismatch');
  fail(manifest.git_blob_sha1 === gitBlobSha1(htmlBytes), 'manifest_git_blob_sha1_mismatch');
  fail(manifest.topic_hint_count === topicCount && topicCount === 27, 'manifest_topic_hint_count_mismatch');
  fail(manifest.api_enabled === false && manifest.public_ai_enabled === false, 'manifest_api_or_public_ai_must_remain_disabled');
  fail(manifest.reviewer_authentication === 'not-implemented', 'manifest_reviewer_authentication_must_remain_unimplemented');
  fail(manifest.backup_restore_verified === false && manifest.destination_verified === false &&
    manifest.deployment_authorized === false, 'manifest_release_flags_must_remain_false');
  fail(typeof manifest.notice === 'string' && /does not prove backup restoration/i.test(manifest.notice), 'manifest_limitation_notice_missing');
  return {
    verified: true,
    artifact_sha256: sha256(buffer),
    archive_bytes: buffer.length,
    files: EXPECTED_NAMES,
    html_bytes: htmlBytes.length,
    html_sha256: sha256(htmlBytes),
    git_blob_sha1: gitBlobSha1(htmlBytes),
    manifest_sha256: sha256(manifestBytes),
    source_commit: manifest.source_commit,
    target_subpath: manifest.target_subpath,
    topic_hint_count: topicCount,
    api_enabled: false,
    public_ai_enabled: false,
    backup_restore_verified: false,
    destination_verified: false,
    deployment_authorized: false,
    deployment_authorized_by_this_tool: false
  };
}
function sameStat(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
    a.nlink === b.nlink && a.mode === b.mode && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
function verifyArtifactFile(archivePath, expectedCommit) {
  fail(typeof archivePath === 'string' && path.isAbsolute(archivePath), 'archive_path_must_be_absolute');
  const absolute = path.resolve(archivePath);
  fail(absolute === archivePath, 'archive_path_must_be_canonical');
  const relative = path.relative(REPO_ROOT, absolute);
  fail(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
    'archive_must_be_outside_git_checkout');
  const beforePath = fs.lstatSync(absolute, { bigint: true });
  fail(beforePath.isFile() && !beforePath.isSymbolicLink(), 'archive_must_be_regular_file');
  fail(beforePath.nlink === 1n, 'archive_hard_link_alias_rejected');
  fail(beforePath.size > 0n && beforePath.size <= BigInt(MAX_ARCHIVE_BYTES), 'archive_file_size_out_of_bounds');
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    fail(opened.isFile() && sameStat(beforePath, opened), 'archive_changed_before_open');
    const buffer = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    const currentPath = fs.lstatSync(absolute, { bigint: true });
    fail(sameStat(opened, after) && sameStat(after, currentPath), 'archive_changed_during_read');
    return verifyArtifactBuffer(buffer, expectedCommit);
  } finally {
    fs.closeSync(fd);
  }
}
if (require.main === module) {
  try {
    const [archivePath, expectedCommit, ...extra] = process.argv.slice(2);
    fail(Boolean(archivePath && expectedCommit) && extra.length === 0,
      'usage: node scripts/verify-public-preview-artifact.cjs /absolute/path/artifact.zip EXPECTED_COMMIT_SHA');
    process.stdout.write(JSON.stringify(verifyArtifactFile(archivePath, expectedCommit), null, 2) + '\n');
  } catch (error) {
    process.stderr.write('preview_artifact_verification_failed: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
module.exports = { crc32, gitBlobSha1, parseZip, sha256, verifyArtifactBuffer, verifyArtifactFile };
