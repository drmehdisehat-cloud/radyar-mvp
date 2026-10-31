'use strict';
// Synthetic history only. Names of historical private configs must fail closed
// even if their content contains no recognised token signature.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const audit = path.resolve(__dirname, '../scripts/audit-git-history.cjs');

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
function commit(root) {
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid',
    'commit', '-qm', 'synthetic history']);
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-historical-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  return root;
}
function auditRepo(root) {
  const run = spawnSync(process.execPath, [audit, root], {
    encoding: 'utf8', timeout: 15000,
  });
  if (run.error) throw run.error;
  return { code: run.status, report: JSON.parse(run.stdout.trim()), raw: run.stdout };
}

test('deleted private environment file blocks a clean historical audit', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.env.production'), 'MODE=synthetic-only\n');
  commit(root);
  git(root, ['rm', '-q', '.env.production']);
  commit(root);
  const result = auditRepo(root);
  assert.equal(result.code, 1);
  assert.equal(result.report.status, 'NOT_READY');
  assert.equal(result.report.historicalSensitivePaths, 1);
  assert.equal(result.report.flaggedBlobs, 0);
  assert.doesNotMatch(result.raw, /\.env\.production|synthetic-only/);
});

test('renamed private config is still caught by historical path audit', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.env'), 'MODE=synthetic-only\n');
  commit(root);
  git(root, ['mv', '.env', 'public-notes.txt']);
  commit(root);
  const result = auditRepo(root);
  assert.equal(result.code, 1);
  assert.equal(result.report.historicalSensitivePaths, 1);
  assert.doesNotMatch(result.raw, /public-notes|synthetic-only/);
});

test('clearly named non-secret templates remain auditable', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.env.example'), 'MODE=placeholder\n');
  commit(root);
  const result = auditRepo(root);
  assert.equal(result.code, 0);
  assert.equal(result.report.status, 'PASS');
  assert.equal(result.report.historicalSensitivePaths, 0);
});
