'use strict';
// Public-only integrity sidecar for the offline preview. It never deploys,
// changes the source HTML, or includes operator handoff files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const BRANCH = 'dadyar/ai-chat-private-20261101';
const EXPECTED_PUBLIC_FILES_BEFORE = ['index.html'];
const EXPECTED_HANDOFF_FILES = ['PREVIEW-METADATA.json', 'README-fa.txt', 'SHA256SUMS'];
const MAX_HTML_BYTES = 512 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024;

function fail(code) {
  throw new Error(code);
}
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function gitBlobSha1(bytes) {
  const hash = crypto.createHash('sha1');
  hash.update('blob ' + bytes.length + String.fromCharCode(0));
  hash.update(bytes);
  return hash.digest('hex');
}
function isOutside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}
function pathsDisjoint(first, second) {
  return isOutside(first, second) && isOutside(second, first);
}
function assertNoSymlinkComponents(target, label) {
  let current = path.resolve(target);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(label + '_path_contains_symlink');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function canonicalDirectory(target, label) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) fail(label + '_must_be_absolute');
  const absolute = path.resolve(target);
  if (target !== absolute) fail(label + '_must_be_canonical');
  assertNoSymlinkComponents(absolute, label);
  const real = fs.realpathSync(absolute);
  if (real !== absolute) fail(label + '_must_not_have_symlink_aliases');
  if (!fs.statSync(real).isDirectory()) fail(label + '_must_be_directory');
  return real;
}
function readRegular(file, label, maxBytes) {
  return readStableRegularFile(file, label, { includeBytes: true, maxBytes });
}
function createPublicPreviewIntegrityManifest(packageRootArg) {
  if (typeof packageRootArg !== 'string' || !path.isAbsolute(packageRootArg)) {
    fail('package_root_must_be_absolute');
  }
  const packageRoot = canonicalDirectory(packageRootArg, 'package_root');
  const checkoutRoot = fs.realpathSync(REPO_ROOT);
  if (!pathsDisjoint(checkoutRoot, packageRoot)) fail('package_root_must_be_outside_git_checkout');

  const publicDirectory = canonicalDirectory(path.join(packageRoot, 'public'), 'public_directory');
  const handoffDirectory = canonicalDirectory(path.join(packageRoot, 'handoff'), 'handoff_directory');
  if (path.dirname(publicDirectory) !== packageRoot || path.dirname(handoffDirectory) !== packageRoot ||
      path.basename(publicDirectory) !== 'public' || path.basename(handoffDirectory) !== 'handoff') {
    fail('package_layout_invalid');
  }
  const publicNames = fs.readdirSync(publicDirectory).sort();
  if (JSON.stringify(publicNames) !== JSON.stringify(EXPECTED_PUBLIC_FILES_BEFORE)) {
    fail('public_directory_must_contain_only_index_html_before_manifest');
  }
  const handoffNames = fs.readdirSync(handoffDirectory).sort();
  if (JSON.stringify(handoffNames) !== JSON.stringify(EXPECTED_HANDOFF_FILES)) {
    fail('operator_handoff_file_set_invalid');
  }

  const htmlPath = path.join(publicDirectory, 'index.html');
  const metadataPath = path.join(handoffDirectory, 'PREVIEW-METADATA.json');
  const htmlRead = readRegular(htmlPath, 'public_preview_html', MAX_HTML_BYTES);
  const metadataRead = readRegular(metadataPath, 'preview_metadata', MAX_METADATA_BYTES);

  let metadata;
  try {
    metadata = JSON.parse(metadataRead.bytes.toString('utf8'));
  } catch {
    fail('preview_metadata_invalid_json');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    fail('preview_metadata_must_be_object');
  }
  const sourceSha256 = sha256(htmlRead.bytes);
  const sourceBlobSha1 = gitBlobSha1(htmlRead.bytes);
  if (metadata.package !== 'dadyar-offline-preview-handoff') fail('unexpected_package_type');
  if (metadata.source_branch !== BRANCH) fail('unexpected_source_branch');
  if (!/^[a-f0-9]{40}$/i.test(metadata.source_commit || '') || /^0{40}$/i.test(metadata.source_commit)) {
    fail('source_commit_must_be_full_nonzero_sha');
  }
  if (!/^[a-f0-9]{40}$/i.test(metadata.workflow_commit || '') || /^0{40}$/i.test(metadata.workflow_commit)) {
    fail('workflow_commit_must_be_full_nonzero_sha');
  }
  if (!['push', 'pull_request', 'local-test'].includes(metadata.workflow_event)) {
    fail('workflow_event_invalid');
  }
  if (metadata.target_subpath !== '/dadyar-preview/' ||
      metadata.public_payload_path !== 'public/index.html' ||
      metadata.source_file !== 'dadyar-preview/index.html') {
    fail('preview_target_metadata_mismatch');
  }
  if (metadata.source_file_sha256 !== sourceSha256) fail('source_sha256_mismatch');
  if (metadata.source_file_git_blob_sha1 !== sourceBlobSha1) fail('source_git_blob_sha1_mismatch');
  if (metadata.topic_hint_count !== 27) fail('topic_hint_count_mismatch');
  if (metadata.api_enabled !== false || metadata.public_ai_enabled !== false) fail('api_or_public_ai_must_remain_disabled');
  if (metadata.reviewer_authentication !== 'not-implemented' ||
      metadata.reviewer_record_type !== 'local-self-attestation-only') {
    fail('reviewer_authentication_must_remain_unconfigured');
  }
  if (metadata.backup_restore_verified !== false ||
      metadata.destination_verified !== false ||
      metadata.deployment_authorized !== false) {
    fail('release_flags_must_remain_false');
  }

  const manifest = Object.freeze({
    schema: 'dadyar-public-preview-integrity-v1',
    source_commit: metadata.source_commit,
    workflow_commit: metadata.workflow_commit,
    source_branch: BRANCH,
    source_file: 'public/index.html',
    target_subpath: '/dadyar-preview/',
    sha256: sourceSha256,
    git_blob_sha1: sourceBlobSha1,
    topic_hint_count: 27,
    api_enabled: false,
    public_ai_enabled: false,
    reviewer_authentication: 'not-implemented',
    backup_restore_verified: false,
    destination_verified: false,
    deployment_authorized: false,
    notice: 'Integrity evidence only. This manifest does not prove backup restoration, destination validity, reviewer identity, legal accuracy, or deployment authorization.'
  });
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  if (manifestBytes.length > MAX_MANIFEST_BYTES) fail('integrity_manifest_too_large');

  const manifestPath = path.join(publicDirectory, 'INTEGRITY.json');
  let fd;
  try {
    fd = fs.openSync(manifestPath, fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o644);
    fs.writeFileSync(fd, manifestBytes);
    fs.fsyncSync(fd);
  } catch (error) {
    if (error && error.code === 'EEXIST') fail('integrity_manifest_already_exists');
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  fs.chmodSync(manifestPath, 0o644);

  const manifestRead = readRegular(manifestPath, 'public_integrity_manifest', MAX_MANIFEST_BYTES);
  if (!manifestRead.bytes.equals(manifestBytes) || manifestRead.sha256 !== sha256(manifestBytes)) {
    fail('integrity_manifest_readback_mismatch');
  }
  let readback;
  try {
    readback = JSON.parse(manifestRead.bytes.toString('utf8'));
  } catch {
    fail('integrity_manifest_readback_invalid_json');
  }
  if (JSON.stringify(readback) !== JSON.stringify(manifest)) fail('integrity_manifest_readback_content_mismatch');

  const finalNames = fs.readdirSync(publicDirectory).sort();
  if (JSON.stringify(finalNames) !== JSON.stringify(['INTEGRITY.json', 'index.html'])) {
    fail('public_payload_file_set_invalid');
  }
  return {
    manifest: readback,
    manifest_sha256: manifestRead.sha256,
    public_files: finalNames,
    deployment_authorized: false
  };
}

if (require.main === module) {
  try {
    const result = createPublicPreviewIntegrityManifest(process.argv[2]);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write('Public preview integrity manifest refused: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
module.exports = { createPublicPreviewIntegrityManifest, gitBlobSha1, sha256 };
