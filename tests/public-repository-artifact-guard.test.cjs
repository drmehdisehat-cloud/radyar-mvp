'use strict';
// Stage-0 safeguards for the PUBLIC repository. Filename/content checks are
// high-confidence filters, not a complete secret audit or proof of privacy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const pathModule = require('node:path');
const { execFileSync } = require('node:child_process');

const root = pathModule.resolve(__dirname, '..');
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

test('legacy full handoff artifact in stage-0 CI remains private-repository gated', () => {
  const workflow = fs.readFileSync(pathModule.join(root, '.github/workflows/ci.yml'), 'utf8');
  const marker = '- name: Create public-only preview payload artifact';
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'legacy full CI artifact step must remain explicit');
  const end = workflow.indexOf('\n      - name:', start + marker.length);
  const step = workflow.slice(start, end === -1 ? workflow.length : end);
  assert.match(step, /if:\s*>-[\s\S]*github\.event\.repository\.private\s*==\s*true/,
    'the CI artifact path must require a private repository event');
  assert.match(step, /path:\s*\$\{\{\s*runner\.temp\s*\}\}\/dadyar-preview-handoff\/public\/index\.html/,
    'only the single public HTML payload may be uploaded');
  assert.doesNotMatch(step, /handoff\/(?:\*\*|\*)/,
    'operator handoff directory must never be uploaded');
});

test('workflow artifact uploads are limited to the private-gated CI artifact and one public HTML review artifact', () => {
  const workflowDirectory = pathModule.join(root, '.github/workflows');
  const workflowFiles = fs.readdirSync(workflowDirectory).filter(name => /\.ya?ml$/i.test(name));
  const uploads = [];
  const sources = new Map();
  for (const name of workflowFiles) {
    const source = fs.readFileSync(pathModule.join(workflowDirectory, name), 'utf8');
    sources.set(name, source);
    for (const match of source.matchAll(/^\s*uses:\s*actions\/upload-artifact@[^\s]+/gm)) {
      uploads.push({ workflow: name, action: match[0].trim() });
    }
  }
  assert.equal(uploads.length, 2, 'only the two explicitly reviewed artifact workflows may upload');
  assert.deepEqual(uploads.map(item => item.workflow).sort(),
    ['ci.yml', 'public-preview-review-artifact.yml']);

  const review = sources.get('public-preview-review-artifact.yml');
  assert.match(review, /^on:\s*\n  push:\s*\n    branches:\s*\n      - dadyar\/ai-chat-private-20261101\s*$/m,
    'public review artifact must run only on a push to the exact experimental branch');
  assert.doesNotMatch(review, /^\s*(?:pull_request|pull_request_target|workflow_dispatch|schedule):/m);
  assert.match(review, /^permissions:\s*\n  contents: read\s*$/m);
  assert.match(review, /persist-credentials: false/);
  assert.match(review, /actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(review, /path:\s*\$\{\{\s*runner\.temp\s*\}\}\/dadyar-preview-handoff\/public\/index\.html/);
  assert.match(review, /retention-days: 7/);
  assert.doesNotMatch(review, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(review, /^\s*(?:contents|actions|id-token|packages): write\s*$/m);
  assert.doesNotMatch(review, /(?:scp|sftp|ftp|ssh|rsync|vercel\s+--prod|netlify\s+deploy|firebase\s+deploy|wrangler\s+deploy)/i);
});
