'use strict';
// Regression contract: PR artifacts must identify the reviewed head, not GitHub's synthetic merge commit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'scripts/build-offline-preview-package.cjs'), 'utf8');

test('offline preview artifact pins PR source SHA separately from workflow merge SHA', () => {
  assert.match(workflow, /DADYAR_PREVIEW_SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /DADYAR_PREVIEW_WORKFLOW_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /name: dadyar-offline-preview-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(builder, /const commit = options\.commit \|\| process\.env\.DADYAR_PREVIEW_SOURCE_SHA \|\| process\.env\.GITHUB_SHA/);
  assert.match(builder, /const workflowCommit = options\.workflowCommit \|\| process\.env\.DADYAR_PREVIEW_WORKFLOW_SHA \|\| process\.env\.GITHUB_SHA \|\| commit/);
  assert.match(builder, /source_commit: commit/);
  assert.match(builder, /workflow_commit: workflowCommit/);
  assert.match(builder, /source_branch: branch/);
});


test('handoff metadata cannot claim authenticated review, restored backup or an approved destination', () => {
  assert.match(builder, /reviewer_authentication: 'not-implemented'/);
  assert.match(builder, /reviewer_record_type: 'local-self-attestation-only'/);
  assert.match(builder, /backup_restore_verified: false/);
  assert.match(builder, /destination_verified: false/);
  assert.match(builder, /deployment_authorized: false/);
  assert.match(builder, /public_ai_enabled: false/);
});

test('preview artifact remains a non-deploying, read-only handoff', () => {
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.doesNotMatch(workflow, /deployments:\s*write|contents:\s*write/);
  assert.match(builder, /release_authorized: false/);
  assert.match(builder, /api_enabled: false/);
  assert.match(builder, /deployment_authorized: false/);
});
