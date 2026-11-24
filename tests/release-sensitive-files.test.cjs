'use strict';
// Release gate for accidental credential and local-data inclusion.
// This is a narrow pattern check, not a full secrets audit or DLP system.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const forbiddenBasenames = /^(?:\.env(?:\..+)?|\.npmrc|\.pypirc|\.git-credentials|id_rsa|id_ed25519|credentials\.json|service[-_]account(?:[-_][^/]*)?\.json|client[-_]records?\.(?:csv|json|xlsx)|case[-_](?:data|export)\.(?:csv|json|xlsx))$/i;
const forbiddenClientExports = /^(?:clients?|cases?|client[-_ ](?:data|notes|records?|exports?)|case[-_ ](?:data|notes|records?|exports?)|موکلان|پرونده(?:ها|‌ها)?|مشخصات[-_ ]?موکل)\.(?:csv|tsv|json|xlsx?|pdf|docx?|txt)$/i;
const forbiddenExtensions = /\.(?:pem|p8|p12|pfx|key|jks|keystore|kdbx|sqlite|sqlite3|db|db-journal|sqlite-wal|sqlite-shm|har|pcap|pcapng|log)$/i;
const signatures = Object.freeze([
  ['private-key-block', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ['github-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/],
  ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['openai-api-key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
]);
function detect(value) {
  return signatures.filter(([, expression]) => expression.test(value)).map(([name]) => name);
}
function badFilename(relative) {
  const name = path.posix.basename(relative);
  return forbiddenBasenames.test(name) || forbiddenClientExports.test(name) || forbiddenExtensions.test(name);
}
// Synthetic, never-valid credentials prove that detectors are active.
assert.deepEqual(detect('ghp_' + 'A'.repeat(36)), ['github-token']);
assert.deepEqual(detect('github_pat_' + 'B'.repeat(55)), ['github-fine-grained-token']);
assert.deepEqual(detect('sk-proj-' + 'C'.repeat(40)), ['openai-api-key']);
assert.deepEqual(detect('AKIA' + 'A'.repeat(16)), ['aws-access-key']);
assert.deepEqual(detect('-----BEGIN ' + 'PRIVATE KEY-----'), ['private-key-block']);
assert.deepEqual(detect('ordinary synthetic case text'), []);
for (const name of ['.env', '.env.production', '.git-credentials', 'id_ed25519', 'client.p12',
  'signing.jks', 'signing.keystore', 'ios-auth.p8', 'vault.kdbx', 'case.sqlite',
  'case.sqlite-wal', 'case.sqlite-shm', 'credentials.json', 'service-account.json',
  'service_account-prod.json', 'client-records.csv', 'case-export.json',
  'clients.csv', 'cases.json', 'case-notes.txt', 'client_data.xlsx', 'موکلان.csv',
  'پرونده‌ها.json', 'مشخصات-موکل.pdf', 'api-debug.har', 'request.log']) {
  assert.equal(badFilename('private/' + name), true);
}
assert.equal(badFilename('docs/SECURITY-MVP.md'), false);
assert.equal(badFilename('tests/synthetic-cases.test.cjs'), false);
assert.equal(badFilename('docs/case-law-review.md'), false);
// The release scanner must fail on a real file, not only on regex unit fixtures.
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const syntheticDir = process.argv[2] ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-secret-gate-'));
if (syntheticDir) try {
  fs.writeFileSync(path.join(syntheticDir, 'clients.csv'), 'SYNTHETIC,NO_REAL_DATA\n');
  const run = spawnSync(process.execPath, [__filename, syntheticDir], { encoding: 'utf8' });
  assert.notEqual(run.status, 0, 'public release gate must reject a client-records file');
  assert.match(run.stderr, /clients\.csv: forbidden filename/);
} finally {
  fs.rmSync(syntheticDir, { recursive: true, force: true });
}
const findings = [];
let scanned = 0;
function walk(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!prefix && entry.name === '.git') continue;
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) { findings.push(relative + ': symlink'); continue; }
    if (entry.isDirectory()) { walk(path.join(directory, entry.name), relative); continue; }
    if (!entry.isFile()) { findings.push(relative + ': unexpected file type'); continue; }
    scanned++;
    if (badFilename(relative)) findings.push(relative + ': forbidden filename');
    const fileContent = fs.readFileSync(path.join(directory, entry.name)).toString('utf8');
    for (const kind of detect(fileContent)) findings.push(relative + ': ' + kind);
  }
}
walk(root);
assert.deepEqual(findings, [], 'Sensitive artifact release gate failed:\n' + findings.join('\n'));
console.log('PASS: ' + scanned + ' project files checked for credential patterns, sensitive filenames and symlinks');
