'use strict';
// Stage-0 safeguard for a PUBLIC repository. This checks tracked filenames only;
// it does not inspect file contents, git history, or certify absence of secrets.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function isSensitiveTrackedPath(file) {
  const normalized = file.replace(/\\/g, '/');
  const basename = normalized.split('/').at(-1);
  // Reject private environment configurations, but allow non-secret templates.
  if (/^\.env(?:\..+)?$/i.test(basename) && !/\.example$|\.sample$|\.template$/i.test(basename)) return true;
  // Credential material, local databases, SQL exports, and backup archives
  // must not be published as tracked artifacts.
  return /\.(?:pem|p12|pfx|key|kdbx|sqlite3?|db|sql|bak|backup|dump|zip|tar|tgz|7z)$/i.test(basename) ||
    /\.(?:tar\.gz|tar\.xz|tar\.bz2|sql\.gz|db\.gz)$/i.test(basename);
}

test('sensitive tracked-path policy catches representative private artifacts', () => {
  for (const file of ['.env', '.env.production', 'private/cert.pem',
    'backups/client.sql.gz', 'backups/site.tar.gz', 'storage/cases.sqlite',
    'secrets/identity.p12']) {
    assert.equal(isSensitiveTrackedPath(file), true, 'must reject synthetic sensitive filename');
  }
  for (const file of ['.env.example', 'README.md', 'tests/example.test.cjs',
    'docs/backup-policy.md', 'public/index.html']) {
    assert.equal(isSensitiveTrackedPath(file), false, 'ordinary source or template remains allowed');
  }
});

test('public repository must not track private configuration, keys, or backups', () => {
  // GitHub Actions checks out the actual index. Fail closed if git is missing
  // rather than silently treating the repository as clean.
  const tracked = execFileSync('git', ['ls-files', '-z', '--cached'], {
    cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  assert.ok(tracked.length > 0, 'tracked file inventory must not be empty');
  const flagged = tracked.filter(isSensitiveTrackedPath);
  assert.deepEqual(flagged, [], 'tracked sensitive filenames must be removed before review');
});
