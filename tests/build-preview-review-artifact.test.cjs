'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const builder = path.join(root, 'scripts', 'build-preview-review-artifact.cjs');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function run(output) {
  return spawnSync(process.execPath, [builder, output], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, GITHUB_SHA: git('rev-parse', 'HEAD') }
  });
}
test('builder emits exactly the public HTML and a source-bound fail-closed manifest', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-preview-artifact-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const output = path.join(temp, 'public');
  const result = run(output);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(fs.readdirSync(output).sort(), ['INTEGRITY.json', 'index.html']);
  const html = fs.readFileSync(path.join(output, 'index.html'));
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'INTEGRITY.json'), 'utf8'));
  assert.equal(manifest.sourceCommit, git('rev-parse', 'HEAD'));
  assert.equal(manifest.sourceGitBlobSha1, git('rev-parse', 'HEAD:dadyar-preview/index.html'));
  assert.equal(manifest.htmlSha256, sha256(html));
  assert.equal(manifest.htmlBytes, html.length);
  assert.equal(manifest.route, '/dadyar-preview/');
  assert.deepEqual(manifest.files, ['index.html', 'INTEGRITY.json']);
  assert.equal(manifest.release.status, 'NOT_READY');
  assert.equal(manifest.release.apiEnabled, false);
  assert.equal(manifest.release.publicAiEnabled, false);
  assert.equal(manifest.release.reviewerAuthentication, 'not-configured');
  assert.equal(manifest.release.backupRestoreVerified, false);
  assert.equal(manifest.release.destinationVerified, false);
  assert.equal(manifest.release.deploymentAuthorized, false);
});
test('builder rejects an output parent reached through a symlink before writing files', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-preview-artifact-link-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const realParent = path.join(temp, 'real-parent');
  const aliasParent = path.join(temp, 'alias-parent');
  fs.mkdirSync(realParent);
  fs.symlinkSync(realParent, aliasParent, 'dir');
  const output = path.join(aliasParent, 'public');
  const result = run(output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output_parent_path_contains_symlink/);
  assert.deepEqual(fs.readdirSync(realParent), []);
});
test('builder rejects an existing destination instead of overwriting it', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-preview-artifact-existing-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const output = path.join(temp, 'public');
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, 'keep.txt'), 'synthetic sentinel');
  const result = run(output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output_directory_must_not_exist/);
  assert.equal(fs.readFileSync(path.join(output, 'keep.txt'), 'utf8'), 'synthetic sentinel');
});
test('builder refuses any output destination inside the Git checkout', t => {
  const output = path.join(root, '.dadyar-preview-artifact-test-' + process.pid);
  const result = run(output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output_must_be_outside_git_checkout/);
  assert.equal(fs.existsSync(output), false);
});
