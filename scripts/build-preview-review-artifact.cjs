'use strict';
// Build a review-only static artifact. This script never deploys or contacts a host.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const outputArg = process.argv[2];
function fail(message) { throw new Error(message); }
function rejectSymlinkPathComponents(target, label) {
  if (typeof target !== 'string' || !path.isAbsolute(target) || path.resolve(target) !== target) fail(label + '_path_must_be_absolute_canonical');
  const rootPath = path.parse(target).root;
  let current = rootPath;
  for (const part of target.slice(rootPath.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(label + '_path_contains_symlink');
    if (!stat.isDirectory()) fail(label + '_path_component_not_directory');
  }
  if (fs.realpathSync(target) !== target) fail(label + '_path_not_canonical');
}
if (!outputArg || !path.isAbsolute(outputArg) || path.resolve(outputArg) !== outputArg) fail('output_directory_must_be_absolute_canonical');
const outputParent = path.dirname(outputArg);
rejectSymlinkPathComponents(outputParent, 'output_parent');
const relative = path.relative(root, outputArg);
if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) fail('output_must_be_outside_git_checkout');
try {
  fs.lstatSync(outputArg);
  fail('output_directory_must_not_exist');
} catch (error) {
  if (error.message === 'output_directory_must_not_exist') throw error;
  if (error.code !== 'ENOENT') throw error;
}
fs.mkdirSync(outputArg, { mode: 0o700 });
const output = fs.realpathSync(outputArg);
if (output !== outputArg) fail('output_path_must_be_canonical');
const source = path.join(root, 'dadyar-preview', 'index.html');
const sourceStat = fs.lstatSync(source);
if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) fail('preview_source_must_be_regular_file');
const html = fs.readFileSync(source);
const sha256 = crypto.createHash('sha256').update(html).digest('hex');
const workflowCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceCommit = process.env.DADYAR_PREVIEW_SOURCE_SHA || workflowCommit;
const sourceBlobSha = execFileSync('git', ['rev-parse', sourceCommit + ':dadyar-preview/index.html'], { cwd: root, encoding: 'utf8' }).trim();
const workflowBlobSha = execFileSync('git', ['rev-parse', 'HEAD:dadyar-preview/index.html'], { cwd: root, encoding: 'utf8' }).trim();
const workingTreeBlobSha = execFileSync('git', ['hash-object', source], { cwd: root, encoding: 'utf8' }).trim();
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== workflowCommit) fail('workflow_sha_does_not_match_checkout_head');
if (!/^[a-f0-9]{40}$/.test(sourceCommit) || !/^[a-f0-9]{40}$/.test(workflowCommit) || !/^[a-f0-9]{40}$/.test(sourceBlobSha) || !/^[a-f0-9]{40}$/.test(workflowBlobSha)) fail('git_sha_invalid');
if (sourceBlobSha !== workflowBlobSha || workingTreeBlobSha !== sourceBlobSha) fail('preview_source_differs_from_reviewed_head');
fs.writeFileSync(path.join(output, 'index.html'), html, { flag: 'wx', mode: 0o644 });
const manifest = {
  schemaVersion: 1,
  artifactType: 'dadyar-public-preview-review-only',
  sourceCommit,
  workflowCommit,
  sourcePath: 'dadyar-preview/index.html',
  sourceGitBlobSha1: sourceBlobSha,
  workflowGitBlobSha1: workflowBlobSha,
  htmlSha256: sha256,
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
    'Synthetic data only; no client secrets or real case records.',
    'No legal conclusion is authorized without verified primary sources and independent human legal review.',
    'This artifact is not deployment authorization.'
  ]
};
fs.writeFileSync(path.join(output, 'INTEGRITY.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
const names = fs.readdirSync(output).sort();
if (JSON.stringify(names) !== JSON.stringify(['INTEGRITY.json', 'index.html'])) fail('public_artifact_file_set_mismatch');
const copied = fs.readFileSync(path.join(output, 'index.html'));
if (crypto.createHash('sha256').update(copied).digest('hex') !== sha256 || copied.length !== html.length) fail('copied_preview_integrity_mismatch');
const parsed = JSON.parse(fs.readFileSync(path.join(output, 'INTEGRITY.json'), 'utf8'));
if (parsed.sourceCommit !== sourceCommit || parsed.workflowCommit !== workflowCommit || parsed.sourceGitBlobSha1 !== sourceBlobSha || parsed.workflowGitBlobSha1 !== workflowBlobSha || parsed.release.deploymentAuthorized !== false) fail('manifest_binding_or_release_boundary_mismatch');
process.stdout.write(JSON.stringify({ output, sourceCommit, workflowCommit, sourceGitBlobSha1: sourceBlobSha, workflowGitBlobSha1: workflowBlobSha, htmlSha256: sha256, htmlBytes: html.length, files: names, releaseStatus: parsed.release.status }) + '\n');
