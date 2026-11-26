'use strict';
// Verify the exact bytes downloaded from the uploaded review artifact.
// This is a read-only CI check: it never deploys or contacts a hosting provider.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function fail(code) { throw new Error(code); }
function git(args) {
  return execFileSync('git', args, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
}
const dirArg = process.argv[2];
if (!dirArg || !path.isAbsolute(dirArg) || path.resolve(dirArg) !== dirArg) fail('artifact_directory_must_be_absolute_canonical');
const dirStat = fs.lstatSync(dirArg);
if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) fail('artifact_directory_must_be_regular_directory');
if (fs.realpathSync(dirArg) !== dirArg) fail('artifact_directory_not_canonical');

const names = fs.readdirSync(dirArg).sort();
if (JSON.stringify(names) !== JSON.stringify(['INTEGRITY.json', 'index.html'])) fail('public_artifact_file_set_mismatch');
for (const name of names) {
  const stat = fs.lstatSync(path.join(dirArg, name));
  if (!stat.isFile() || stat.isSymbolicLink()) fail('artifact_member_must_be_regular_file');
  if (stat.nlink !== 1) fail('artifact_member_must_not_be_hard_linked');
}

const expectedCommit = process.env.DADYAR_PREVIEW_SOURCE_SHA || '';
if (!/^[a-f0-9]{40}$/.test(expectedCommit)) fail('expected_source_commit_missing_or_invalid');
const checkedOutCommit = git(['rev-parse', 'HEAD']);
if (checkedOutCommit !== expectedCommit) fail('checked_out_commit_does_not_match_expected_source');
const sourceBlob = git(['rev-parse', expectedCommit + ':dadyar-preview/index.html']);
if (!/^[a-f0-9]{40}$/.test(sourceBlob)) fail('source_git_blob_invalid');

const html = fs.readFileSync(path.join(dirArg, 'index.html'));
const manifestBytes = fs.readFileSync(path.join(dirArg, 'INTEGRITY.json'));
let manifest;
try { manifest = JSON.parse(manifestBytes.toString('utf8')); }
catch { fail('manifest_json_invalid'); }
const htmlSha256 = crypto.createHash('sha256').update(html).digest('hex');

if (manifest.schemaVersion !== 1 || manifest.artifactType !== 'dadyar-public-preview-review-only') fail('artifact_type_or_schema_mismatch');
if (manifest.sourceCommit !== expectedCommit || manifest.workflowCommit !== expectedCommit) fail('artifact_source_or_workflow_commit_mismatch');
if (manifest.sourcePath !== 'dadyar-preview/index.html') fail('artifact_source_path_mismatch');
if (manifest.sourceGitBlobSha1 !== sourceBlob || manifest.workflowGitBlobSha1 !== sourceBlob) fail('artifact_git_blob_binding_mismatch');
if (manifest.htmlSha256 !== htmlSha256 || manifest.htmlBytes !== html.length) fail('artifact_html_integrity_mismatch');
if (manifest.route !== '/dadyar-preview/') fail('artifact_route_mismatch');
if (JSON.stringify(manifest.files) !== JSON.stringify(['index.html', 'INTEGRITY.json'])) fail('manifest_file_allowlist_mismatch');

const release = manifest.release || {};
if (release.status !== 'NOT_READY' || release.apiEnabled !== false || release.publicAiEnabled !== false ||
    release.reviewerAuthentication !== 'not-configured' || release.backupRestoreVerified !== false ||
    release.destinationVerified !== false || release.deploymentAuthorized !== false) {
  fail('artifact_release_boundary_mismatch');
}
const limitations = Array.isArray(manifest.limitations) ? manifest.limitations : [];
if (!limitations.some(value => /Local review is not authenticated reviewer identity/i.test(value))) fail('local_review_limitation_missing');
if (!limitations.some(value => /not deployment authorization/i.test(value))) fail('deployment_limitation_missing');

process.stdout.write(JSON.stringify({
  status: 'UPLOADED_ARTIFACT_ROUND_TRIP_VERIFIED',
  sourceCommit: expectedCommit,
  sourceGitBlobSha1: sourceBlob,
  htmlSha256,
  htmlBytes: html.length,
  files: names,
  route: manifest.route,
  releaseStatus: release.status,
  apiEnabled: release.apiEnabled,
  publicAiEnabled: release.publicAiEnabled
}) + '\n');
