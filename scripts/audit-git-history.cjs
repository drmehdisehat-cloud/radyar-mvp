'use strict';
// Stage-0 historical secret audit. Scans reachable Git blobs across all refs.
// Does not print paths, object IDs, token material, or case contents.
// Requires a full clone: a shallow checkout cannot certify Git history.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
function git(args, maxBuffer = 4 * 1024 * 1024) {
  return execFileSync('git', args, {
    cwd: root, encoding: 'buffer', timeout: 30000, maxBuffer,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const signatures = [
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
];
function main() {
  if (git(['rev-parse', '--is-shallow-repository']).toString('utf8').trim() !== 'false') {
    throw new Error('shallow_history_not_auditable');
  }
  const inventory = git(['rev-list', '--objects', '--all'], 16 * 1024 * 1024)
    .toString('utf8').split('\n').filter(Boolean);
  if (!inventory.length) throw new Error('empty_git_history');
  const seen = new Set();
  let scanned = 0;
  let flagged = 0;
  let oversized = 0;
  for (const line of inventory) {
    const oid = line.split(' ', 1)[0];
    if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(oid) || seen.has(oid)) continue;
    seen.add(oid);
    if (git(['cat-file', '-t', oid]).toString('utf8').trim() !== 'blob') continue;
    const size = Number(git(['cat-file', '-s', oid]).toString('utf8').trim());
    if (!Number.isSafeInteger(size) || size > 2 * 1024 * 1024) { oversized++; continue; }
    scanned++;
    const data = git(['cat-file', 'blob', oid], 3 * 1024 * 1024).toString('utf8');
    if (signatures.some(pattern => pattern.test(data))) flagged++;
  }
  const status = flagged === 0 && oversized === 0 ? 'PASS' : 'NOT_READY';
  process.stdout.write(JSON.stringify({ status, scannedBlobs: scanned,
    flaggedBlobs: flagged, unreviewedLargeBlobs: oversized }) + '\n');
  if (status !== 'PASS') process.exitCode = 1;
}
try { main(); }
catch (error) {
  process.stdout.write(JSON.stringify({ status: 'NOT_READY', reason: 'history_audit_incomplete' }) + '\n');
  process.exitCode = 1;
}
