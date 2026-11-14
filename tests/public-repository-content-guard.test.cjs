'use strict';
// Stage-0 high-confidence secret-content guard for the PUBLIC repository.
// Checks current tracked file contents only, not Git history, encrypted data,
// obfuscated secrets, or arbitrary credentials. Never prints matched values.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const signatures = [
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
];
function containsHighConfidenceSecret(content) {
  return signatures.some(pattern => pattern.test(content));
}

test('secret-content signatures catch synthetic tokens without printing values', () => {
  for (const example of [
    '-----BEGIN ' + 'PRIVATE KEY-----',
    'AK' + 'IA' + 'A'.repeat(16),
    'gh' + 'p_' + 'a'.repeat(36),
    'github_' + 'pat_' + 'a'.repeat(35),
    'xox' + 'b-' + 'a'.repeat(24),
  ]) assert.equal(containsHighConfidenceSecret(example), true);
  for (const ordinary of [
    'README: use environment variables; never commit secrets',
    '-----BEGIN PUBLIC KEY-----',
    'AKIAEXAMPLE',
    'ghp_placeholder',
    'github_pat_REDACTED',
  ]) assert.equal(containsHighConfidenceSecret(ordinary), false);
});

test('public repository must not contain high-confidence secrets in tracked files', () => {
  // Fail closed when Git is unavailable. GitHub Actions checks out the index.
  const tracked = execFileSync('git', ['ls-files', '-z', '--cached'], {
    cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  assert.ok(tracked.length > 0, 'tracked file inventory must not be empty');
  const flagged = [];
  for (const name of tracked) {
    const fullPath = path.join(root, name);
    const info = fs.lstatSync(fullPath);
    // A tracked symlink can point outside the checkout or hide secret material.
    assert.equal(info.isSymbolicLink(), false, 'tracked symlink requires manual review: ' + name);
    if (!info.isFile()) continue;
    assert.ok(info.size <= 2 * 1024 * 1024, 'large tracked file requires manual review: ' + name);
    if (containsHighConfidenceSecret(fs.readFileSync(fullPath).toString('utf8'))) flagged.push(name);
  }
  // Only filenames are surfaced, never matched secret text.
  assert.deepEqual(flagged, [], 'tracked files contain high-confidence secret signatures');
});
