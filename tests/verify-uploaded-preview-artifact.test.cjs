'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const verifier = path.join(root, 'scripts', 'verify-uploaded-preview-artifact.cjs');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceCommit = git('rev-parse', 'HEAD');
const sourceBlob = git('rev-parse', sourceCommit + ':dadyar-preview/index.html');
const html = fs.readFileSync(path.join(root, 'dadyar-preview', 'index.html'));

function fixture(t, mutate) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-upload-roundtrip-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const dir = path.join(parent, 'artifact');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  const manifest = {
    schemaVersion: 1,
    artifactType: 'dadyar-public-preview-review-only',
    sourceCommit,
    workflowCommit: sourceCommit,
    sourcePath: 'dadyar-preview/index.html',
    sourceGitBlobSha1: sourceBlob,
    workflowGitBlobSha1: sourceBlob,
    htmlSha256: sha256(html),
    htmlBytes: html.length,
    route: '/dadyar-preview/',
    files: ['index.html', 'INTEGRITY.json'],
    release: {
      status: 'NOT_READY',
      apiEnabled: false,
      publicAiEnabled: false,
      reviewerAuthentication: 'not-configured',
      backupRestoreVerified: false,
      destinationVerified: false,
      deploymentAuthorized: false
    },
    limitations: [
      'Local review is not authenticated reviewer identity.',
      'This artifact is not deployment authorization.'
    ]
  };
  if (mutate) mutate({ dir, manifest });
  fs.writeFileSync(path.join(dir, 'INTEGRITY.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { dir, manifest };
}
function verify(dir, expected = sourceCommit) {
  return spawnSync(process.execPath, [verifier, dir], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, DADYAR_PREVIEW_SOURCE_SHA: expected }
  });
}

test('uploaded artifact round-trip accepts only exact source-bound two-file package', t => {
  const { dir } = fixture(t);
  const result = verify(dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'UPLOADED_ARTIFACT_ROUND_TRIP_VERIFIED');
  assert.equal(output.sourceCommit, sourceCommit);
  assert.equal(output.sourceGitBlobSha1, sourceBlob);
  assert.equal(output.htmlSha256, sha256(html));
  assert.deepEqual(output.files, ['INTEGRITY.json', 'index.html']);
  assert.equal(output.route, '/dadyar-preview/');
  assert.equal(output.releaseStatus, 'NOT_READY');
  assert.equal(output.apiEnabled, false);
  assert.equal(output.publicAiEnabled, false);
});

test('round-trip rejects HTML tampering after artifact upload', t => {
  const { dir } = fixture(t);
  fs.appendFileSync(path.join(dir, 'index.html'), '\n<!-- tampered -->');
  const result = verify(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /artifact_html_integrity_mismatch/);
});

test('round-trip rejects an unexpected third file', t => {
  const { dir } = fixture(t);
  fs.writeFileSync(path.join(dir, 'operator-notes.txt'), 'synthetic');
  const result = verify(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /public_artifact_file_set_mismatch/);
});

test('round-trip rejects a symlinked artifact member', t => {
  const { dir } = fixture(t);
  const source = path.join(dir, 'index.html');
  fs.unlinkSync(source);
  fs.symlinkSync(path.join(root, 'dadyar-preview', 'index.html'), source);
  const result = verify(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /artifact_member_must_be_regular_file/);
});

test('round-trip rejects a hard-linked artifact member', t => {
  const { dir } = fixture(t);
  fs.linkSync(path.join(dir, 'index.html'), path.join(os.tmpdir(), 'dadyar-artifact-hardlink-' + process.pid));
  t.after(() => fs.rmSync(path.join(os.tmpdir(), 'dadyar-artifact-hardlink-' + process.pid), { force: true }));
  const result = verify(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /artifact_member_must_not_be_hard_linked/);
});

test('round-trip rejects any attempt to enable API or public AI in the manifest', t => {
  const { dir } = fixture(t, ({ manifest }) => {
    manifest.release.apiEnabled = true;
  });
  const result = verify(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /artifact_release_boundary_mismatch/);
});

test('round-trip rejects a source commit that differs from the checked-out push', t => {
  const { dir, manifest } = fixture(t);
  manifest.sourceCommit = '0000000000000000000000000000000000000000';
  fs.writeFileSync(path.join(dir, 'INTEGRITY.json'), JSON.stringify(manifest, null, 2) + '\n');
  const result = verify(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /artifact_source_or_workflow_commit_mismatch/);
});
