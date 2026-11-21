'use strict';
// Stage-0 safeguards for the PUBLIC repository. Filename/content checks are
// high-confidence filters, not a complete secret audit or proof of privacy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function isSensitiveTrackedPath(file) {
  const normalized = file.replace(/\\/g, '/');
  const basename = normalized.split('/').at(-1);
  if (/^\.env(?:\..+)?$/i.test(basename) && !/\.example$|\.sample$|\.template$/i.test(basename)) return true;
  if (/^(?:id_(?:rsa|dsa|ecdsa|ed25519)|\.npmrc|\.pypirc|\.netrc|\.git-credentials|credentials(?:\.json)?|terraform\.tfstate(?:\.backup)?)$/i.test(basename)) return true;
  if (/(?:^|\/)(?:\.aws\/credentials|\.kube\/config|\.docker\/config\.json)$/i.test(normalized)) return true;
  if (/\.tfvars(?:\.json)?$/i.test(basename)) return true;
  return /\.(?:pem|p12|pfx|key|kdbx|sqlite3?|db|sql|bak|backup|dump|zip|tar|tgz|7z)$/i.test(basename) ||
    /\.(?:tar\.gz|tar\.xz|tar\.bz2|sql\.gz|db\.gz)$/i.test(basename);
}

test('sensitive tracked-path policy catches representative private artifacts', () => {
  for (const file of ['.env', '.env.production', 'private/cert.pem',
    'backups/client.sql.gz', 'backups/site.tar.gz', 'storage/cases.sqlite',
    'secrets/identity.p12', 'private/id_rsa', 'private/id_ed25519',
    '.npmrc', '.pypirc', '.netrc', '.git-credentials',
    '.aws/credentials', 'home/.kube/config', 'home/.docker/config.json',
    'infra/terraform.tfstate', 'infra/terraform.tfstate.backup',
    'infra/prod.tfvars', 'infra/prod.tfvars.json', 'secrets/credentials.json']) {
    assert.equal(isSensitiveTrackedPath(file), true, 'must reject synthetic sensitive filename');
  }
  for (const file of ['.env.example', 'README.md', 'tests/example.test.cjs',
    'docs/backup-policy.md', 'public/index.html',
    'keys/id_rsa.pub', '.npmrc.example', 'infra/prod.tfvars.example',
    'docs/credentials-policy.md']) {
    assert.equal(isSensitiveTrackedPath(file), false, 'ordinary source or template remains allowed');
  }
});

test('public repository must not track private configuration, keys, or backups', () => {
  const tracked = execFileSync('git', ['ls-files', '-z', '--cached'], {
    cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  assert.ok(tracked.length > 0, 'tracked file inventory must not be empty');
  const flagged = tracked.filter(isSensitiveTrackedPath);
  assert.deepEqual(flagged, [], 'tracked sensitive filenames must be removed before review');
});

test('public repository must not upload preview artifacts until repository is private', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const marker = '- name: Create public-only preview payload artifact';
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'public preview artifact step must remain explicit');
  const end = workflow.indexOf('\n      - name:', start + marker.length);
  const step = workflow.slice(start, end === -1 ? workflow.length : end);
  assert.match(step, /if:\s*>-[\s\S]*github\.event\.repository\.private\s*==\s*true/,
    'artifact upload must require a private repository event');
  assert.match(step, /path:\s*\$\{\{\s*runner\.temp\s*\}\}\/dadyar-preview-handoff\/public\/index\.html/,
    'only the single public HTML payload may be uploaded');
  assert.doesNotMatch(step, /handoff\/(?:\*\*|\*)/,
    'operator handoff directory must never be uploaded');
});
