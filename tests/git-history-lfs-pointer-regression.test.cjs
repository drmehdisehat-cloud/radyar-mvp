'use strict';
// Synthetic-only regression: Git LFS pointers do not contain the actual blob.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const audit = path.resolve(__dirname, '../scripts/audit-git-history.cjs');

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-lfs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  return root;
}
function commit(root, content) {
  fs.writeFileSync(path.join(root, 'synthetic.txt'), content);
  git(root, ['add', 'synthetic.txt']);
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    'commit', '-qm', 'synthetic']);
}
function run(root) {
  const p = spawnSync(process.execPath, [audit, root], { encoding: 'utf8', timeout: 10000 });
  if (p.error) throw p.error;
  return { code: p.status, result: JSON.parse(p.stdout.trim()) };
}

test('Git LFS pointer in a historical blob blocks release even after deletion', t => {
  const root = fixture(t);
  commit(root, 'version https://git-lfs.github.com/spec/v1\n' +
    'oid sha256:' + 'a'.repeat(64) + '\nsize 64\n');
  commit(root, 'ordinary content');
  const { code, result } = run(root);
  assert.equal(code, 1);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.unreviewedLfsPointers, 1);
  assert.equal(result.flaggedBlobs, 0);
});

test('ordinary synthetic history still passes with no LFS pointers', t => {
  const root = fixture(t);
  commit(root, 'A safe synthetic file.');
  const { code, result } = run(root);
  assert.equal(code, 0);
  assert.equal(result.status, 'PASS');
  assert.equal(result.unreviewedLfsPointers, 0);
});
