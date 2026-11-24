'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildOfflinePreviewPackage } = require('../scripts/build-offline-preview-package.cjs');
const { createPublicPreviewIntegrityManifest, gitBlobSha1, sha256 } =
  require('../scripts/create-public-preview-integrity-manifest.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const BRANCH = 'dadyar/ai-chat-private-20261101';

function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-public-integrity-'));
  fs.chmodSync(parent, 0o700);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const packageRoot = path.join(parent, 'package');
  const commit = 'a'.repeat(40);
  const workflowCommit = 'b'.repeat(40);
  buildOfflinePreviewPackage(packageRoot, {
    commit, workflowCommit, workflowEvent: 'push', branch: BRANCH
  });
  return {
    parent,
    packageRoot,
    publicDirectory: path.join(packageRoot, 'public'),
    htmlPath: path.join(packageRoot, 'public', 'index.html'),
    manifestPath: path.join(packageRoot, 'public', 'INTEGRITY.json'),
    commit,
    workflowCommit
  };
}

test('creates a public integrity sidecar bound to exact HTML bytes and source commit', t => {
  const f = fixture(t);
  const result = createPublicPreviewIntegrityManifest(f.packageRoot);
  const manifest = JSON.parse(fs.readFileSync(f.manifestPath, 'utf8'));
  const html = fs.readFileSync(f.htmlPath);
  assert.deepEqual(result.public_files, ['INTEGRITY.json', 'index.html']);
  assert.equal(result.deployment_authorized, false);
  assert.equal(manifest.schema, 'dadyar-public-preview-integrity-v1');
  assert.equal(manifest.source_commit, f.commit);
  assert.equal(manifest.workflow_commit, f.workflowCommit);
  assert.equal(manifest.source_branch, BRANCH);
  assert.equal(manifest.source_file, 'public/index.html');
  assert.equal(manifest.target_subpath, '/dadyar-preview/');
  assert.equal(manifest.sha256, sha256(html));
  assert.equal(manifest.git_blob_sha1, gitBlobSha1(html));
  assert.equal(manifest.topic_hint_count, 27);
  assert.equal(manifest.api_enabled, false);
  assert.equal(manifest.public_ai_enabled, false);
  assert.equal(manifest.reviewer_authentication, 'not-configured');
  assert.equal(manifest.backup_restore_verified, false);
  assert.equal(manifest.destination_verified, false);
  assert.equal(manifest.deployment_authorized, false);
  assert.match(manifest.notice, /Reviewer authentication is not configured/);
  assert.match(manifest.notice, /does not prove backup restoration/);
  assert.equal(result.manifest_sha256, sha256(fs.readFileSync(f.manifestPath)));
  assert.equal(fs.statSync(f.manifestPath).mode & 0o777, 0o644);
});

test('rejects HTML modified after the package builder pinned its hashes', t => {
  const f = fixture(t);
  fs.appendFileSync(f.htmlPath, Buffer.from('synthetic tamper'));
  assert.throws(() => createPublicPreviewIntegrityManifest(f.packageRoot), /source_sha256_mismatch/);
  assert.equal(fs.existsSync(f.manifestPath), false);
});

test('rejects an incorrect source Git blob pin even when SHA-256 metadata is updated', t => {
  const f = fixture(t);
  const metadataPath = path.join(f.packageRoot, 'handoff', 'PREVIEW-METADATA.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  metadata.source_file_git_blob_sha1 = 'c'.repeat(40);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata), { mode: 0o600 });
  assert.throws(() => createPublicPreviewIntegrityManifest(f.packageRoot), /source_git_blob_sha1_mismatch/);
});

test('rejects package metadata that marks restore, destination or deployment as verified', t => {
  for (const field of ['backup_restore_verified', 'destination_verified', 'deployment_authorized']) {
    const f = fixture(t);
    const metadataPath = path.join(f.packageRoot, 'handoff', 'PREVIEW-METADATA.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    metadata[field] = true;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata), { mode: 0o600 });
    assert.throws(() => createPublicPreviewIntegrityManifest(f.packageRoot), /release_flags_must_remain_false/);
  }
});

test('rejects ambiguous or promoted reviewer authentication metadata', t => {\n  for (const value of ['not-implemented', 'verified', 'connected']) {\n    const f = fixture(t);\n    const metadataPath = path.join(f.packageRoot, 'handoff', 'PREVIEW-METADATA.json');\n    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));\n    metadata.reviewer_authentication = value;\n    fs.writeFileSync(metadataPath, JSON.stringify(metadata), { mode: 0o600 });\n    assert.throws(() => createPublicPreviewIntegrityManifest(f.packageRoot), /reviewer_authentication_must_remain_unconfigured/);\n  }\n});\n\ntest('rejects API or public AI activation metadata', t => {
  const f = fixture(t);
  const metadataPath = path.join(f.packageRoot, 'handoff', 'PREVIEW-METADATA.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  metadata.api_enabled = true;
  fs.writeFileSync(metadataPath, JSON.stringify(metadata), { mode: 0o600 });
  assert.throws(() => createPublicPreviewIntegrityManifest(f.packageRoot), /api_or_public_ai_must_remain_disabled/);
});

test('refuses to overwrite an existing integrity sidecar', t => {
  const f = fixture(t);
  fs.writeFileSync(f.manifestPath, '{"synthetic":true}', { mode: 0o644 });
  assert.throws(() => createPublicPreviewIntegrityManifest(f.packageRoot), /public_directory_must_contain_only_index_html_before_manifest/);
  assert.equal(fs.readFileSync(f.manifestPath, 'utf8'), '{"synthetic":true}');
});

test('rejects an unexpected file in the public payload', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.publicDirectory, 'extra.txt'), 'synthetic');
  assert.throws(() => createPublicPreviewIntegrityManifest(f.packageRoot), /public_directory_must_contain_only_index_html_before_manifest/);
});

test('rejects a symlinked public HTML file', t => {
  const f = fixture(t);
  fs.unlinkSync(f.htmlPath);
  fs.symlinkSync(path.join(REPO_ROOT, 'dadyar-preview', 'index.html'), f.htmlPath);
  assert.throws(() => createPublicPreviewIntegrityManifest(f.packageRoot), /ELOOP|symlink|regular file|path changed/i);
});

test('rejects a package directory inside the Git checkout', () => {
  assert.throws(
    () => createPublicPreviewIntegrityManifest(path.join(REPO_ROOT, 'dadyar-preview')),
    /package_root_must_be_outside_git_checkout/
  );
});

test('refuses an unexpected branch identity', t => {
  const f = fixture(t);
  const metadataPath = path.join(f.packageRoot, 'handoff', 'PREVIEW-METADATA.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  metadata.source_branch = 'main';
  fs.writeFileSync(metadataPath, JSON.stringify(metadata), { mode: 0o600 });
  assert.throws(() => createPublicPreviewIntegrityManifest(f.packageRoot), /unexpected_source_branch/);
});
