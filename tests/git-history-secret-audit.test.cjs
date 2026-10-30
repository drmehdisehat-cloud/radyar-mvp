'use strict';
// Synthetic repositories only: test historical scanning without real credentials.
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
function commit(root, name, content) {
  fs.writeFileSync(path.join(root, name), content);
  git(root, ['add', name]);
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    'commit', '-m', 'synthetic']);
}
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-history-'));
  git(root, ['init', '-q']);
  return root;
}
function run(root) {
  const p = spawnSync(process.execPath, [audit, root], { encoding: 'utf8', timeout: 10000 });
  if (p.error) throw p.error;
  return { code: p.status, output: JSON.parse(p.stdout.trim()) };
}
test('clean synthetic history passes', t => {
  const root = setup(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  commit(root, 'note.txt', 'No credentials here.');
  assert.equal(run(root).code, 0);
  assert.equal(run(root).output.status, 'PASS');
});
test('a synthetic token deleted in HEAD remains detectable in Git history', t => {
  const root = setup(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  commit(root, 'note.txt', 'gh' + 'p_' + 'A'.repeat(36));
  commit(root, 'note.txt', 'Now clean');
  const result = run(root);
  assert.equal(result.code, 1);
  assert.equal(result.output.status, 'NOT_READY');
  assert.equal(result.output.flaggedBlobs, 1);
  assert.doesNotMatch(JSON.stringify(result.output), /ghp_/);
});
test('shallow history fails closed', t => {
  const root = setup();
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-shallow-'));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(clone, { recursive: true, force: true }); });
  commit(root, 'note.txt', 'first');
  commit(root, 'note.txt', 'second');
  git(clone, ['clone', '-q', '--depth=1', 'file://' + root, 'checkout']);
  const result = run(path.join(clone, 'checkout'));
  assert.equal(result.code, 1);
  assert.equal(result.output.reason, 'history_audit_incomplete');
});
