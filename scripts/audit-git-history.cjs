'use strict';
// Stage-0 historical secret audit. Scans reachable Git blobs across all refs.
// Does not print paths, object IDs, token material, or case contents.
// Requires a full clone: a shallow checkout cannot certify Git history.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const OBJECT_BATCH_SIZE = 512;
const BLOB_BATCH_SIZE = 8;
const signatures = [
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\\bAKIA[0-9A-Z]{16}\\b/,
  /\\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{30,})\\b/,
  /\\bxox[baprs]-[0-9A-Za-z-]{20,}\\b/,
];

function git(args, maxBuffer = 16 * 1024 * 1024) {
  return execFileSync('git', args, {
    cwd: root, encoding: 'buffer', timeout: 120000, maxBuffer,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function gitWithInput(args, input, maxBuffer) {
  return execFileSync('git', args, {
    cwd: root, encoding: 'buffer', timeout: 120000, maxBuffer,
    input: Buffer.from(input, 'utf8'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
function isSensitiveHistoricalName(name) {
  const basename = name.split('/').at(-1);
  if (/^\\.env(?:\\..+)?$/i.test(basename) &&
      !/\\.(?:example|sample|template)$/i.test(basename)) return true;
  return /^(?:id_(?:rsa|dsa|ecdsa|ed25519)|\\.npmrc|\\.pypirc|\\.netrc|\\.git-credentials|credentials(?:\\.json)?)$/i.test(basename);
}
function objectIdsFromInventory(inventory) {
  const seen = new Set();
  const ids = [];
  for (const line of inventory) {
    const oid = line.split(' ', 1)[0];
    if (/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(oid) && !seen.has(oid)) {
      seen.add(oid);
      ids.push(oid);
    }
  }
  return ids;
}
function readBlobMetadata(ids, counts) {
  const blobs = [];
  for (let start = 0; start < ids.length; start += OBJECT_BATCH_SIZE) {
    const batch = ids.slice(start, start + OBJECT_BATCH_SIZE);
    const output = gitWithInput(
      ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      batch.join('\\n') + '\\n',
      4 * 1024 * 1024
    ).toString('utf8').trimEnd();
    const lines = output ? output.split('\\n') : [];
    if (lines.length !== batch.length) throw new Error('object_metadata_batch_incomplete');
    for (let index = 0; index < lines.length; index += 1) {
      const fields = lines[index].split(' ');
      if (fields.length !== 3 || fields[0] !== batch[index]) throw new Error('object_metadata_shape_invalid');
      if (fields[1] !== 'blob') continue;
      const size = Number(fields[2]);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('blob_size_invalid');
      if (size > MAX_BLOB_BYTES) counts.oversized += 1;
      else blobs.push({ oid: fields[0], size });
    }
  }
  return blobs;
}
function scanBlobBatch(blobs, counts) {
  if (!blobs.length) return;
  const maxBuffer = BLOB_BATCH_SIZE * MAX_BLOB_BYTES + 1024 * BLOB_BATCH_SIZE;
  const output = gitWithInput(
    ['cat-file', '--batch'],
    blobs.map(blob => blob.oid).join('\\n') + '\\n',
    maxBuffer
  );
  let offset = 0;
  for (const expected of blobs) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd < 0) throw new Error('blob_batch_header_missing');
    const header = output.subarray(offset, headerEnd).toString('ascii').split(' ');
    if (header.length !== 3 || header[0] !== expected.oid ||
        header[1] !== 'blob' || Number(header[2]) !== expected.size) {
      throw new Error('blob_batch_header_mismatch');
    }
    offset = headerEnd + 1;
    const contentEnd = offset + expected.size;
    if (contentEnd >= output.length || output[contentEnd] !== 0x0a) {
      throw new Error('blob_batch_content_truncated');
    }
    const data = output.subarray(offset, contentEnd).toString('utf8');
    offset = contentEnd + 1;
    counts.scanned += 1;
    if (/^version https:\\/\\/git-lfs\\.github\\.com\\/spec\\/v1\\r?\\n/.test(data)) counts.lfsPointers += 1;
    if (signatures.some(pattern => pattern.test(data))) counts.flagged += 1;
  }
  if (offset !== output.length) throw new Error('blob_batch_trailing_bytes');
}
function main() {
  if (git(['rev-parse', '--is-shallow-repository']).toString('utf8').trim() !== 'false') {
    throw new Error('shallow_history_not_auditable');
  }
  const inventory = git(['rev-list', '--objects', '--all'], 16 * 1024 * 1024)
    .toString('utf8').split('\\n').filter(Boolean);
  if (!inventory.length) throw new Error('empty_git_history');
  const historicalNames = git(['log', '--all', '--format=', '--name-only', '-z'],
    16 * 1024 * 1024).toString('utf8').split('\\0').filter(Boolean);
  const historicalSensitivePaths = new Set(historicalNames.filter(isSensitiveHistoricalName)).size;
  const counts = { scanned: 0, flagged: 0, oversized: 0, lfsPointers: 0 };
  const ids = objectIdsFromInventory(inventory);
  const blobs = readBlobMetadata(ids, counts);
  for (let start = 0; start < blobs.length; start += BLOB_BATCH_SIZE) {
    scanBlobBatch(blobs.slice(start, start + BLOB_BATCH_SIZE), counts);
  }
  const status = counts.flagged === 0 && counts.oversized === 0 &&
    counts.lfsPointers === 0 && historicalSensitivePaths === 0 ? 'PASS' : 'NOT_READY';
  process.stdout.write(JSON.stringify({
    status, scannedBlobs: counts.scanned, flaggedBlobs: counts.flagged,
    unreviewedLargeBlobs: counts.oversized, unreviewedLfsPointers: counts.lfsPointers,
    historicalSensitivePaths
  }) + '\\n');
  if (status !== 'PASS') process.exitCode = 1;
}
try { main(); }
catch {
  process.stdout.write(JSON.stringify({ status: 'NOT_READY', reason: 'history_audit_incomplete' }) + '\\n');
  process.exitCode = 1;
}
