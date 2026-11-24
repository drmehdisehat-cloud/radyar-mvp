'use strict';
// Release-gate regressions on disposable repositories with synthetic data only.
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
function commit(root, filename, content) {
  fs.writeFileSync(path.join(root, filename), content);
  git(root, ['add', filename]);
  git(root, ['-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid',
    'commit', '-qm', 'synthetic fixture']);
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-audit-edge-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  return root;
}
function run(root) {
  const result = spawnSync(process.execPath, [audit, root], {
    encoding: 'utf8', timeout: 15000,
  });
  if (result.error) throw result.error;
  return { code: result.status, output: JSON.parse(result.stdout.trim()) };
}

test('audit rejects synthetic credentials reachable only from a secondary branch', t => {
  const root = fixture(t);
  commit(root, 'note.txt', 'clean fixture');
  const original = git(root, ['branch', '--show-current']);
  git(root, ['checkout', '-qb', 'synthetic-secondary']);
  commit(root, 'note.txt', 'gh' + 'p_' + 'A'.repeat(36));
  git(root, ['checkout', '-q', original]);
  const result = run(root);
  assert.equal(result.code, 1);
  assert.equal(result.output.status, 'NOT_READY');
  assert.equal(result.output.flaggedBlobs, 1);
  assert.doesNotMatch(JSON.stringify(result.output), /ghp_/);
});

test('audit fails closed on an unreviewed blob larger than 2 MiB', t => {
  const root = fixture(t);
  commit(root, 'large.txt', 'Z'.repeat(2 * 1024 * 1024 + 1));
  const result = run(root);
  assert.equal(result.code, 1);
  assert.equal(result.output.status, 'NOT_READY');
  assert.equal(result.output.unreviewedLargeBlobs, 1);
});
