'use strict';
// Security regression: the public review artifact must never include operator handoff data or deploy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github/workflows/public-preview-review-artifact.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('public review artifact workflow runs only on the dedicated experimental branch', () => {
  assert.match(workflow, /^on:\n  push:\n    branches:\n      - dadyar\/ai-chat-private-20261101$/m);
  assert.doesNotMatch(workflow, /^  (?:pull_request|workflow_dispatch|schedule):/m);
});

test('public review artifact workflow has read-only repository permissions', () => {
  assert.match(workflow, /^permissions:\n  contents: read\n  checks: read\n  actions: read$/m);
  assert.doesNotMatch(workflow, /^  (?:contents|checks|actions|deployments|id-token): write$/m);
  assert.doesNotMatch(workflow, /^\s*environment:/m);
});

test('the artifact posture audit waits for the exact-head required CI workflow to complete', () => {
  const wait = workflow.indexOf('name: Wait for exact-head stage-0 CI to finish before posture audit');
  const audit = workflow.indexOf('name: Audit GitHub repository release posture (read-only; informational)');
  assert.ok(wait >= 0, 'exact-head CI wait step is required');
  assert.ok(audit > wait, 'posture audit must run after exact-head CI completion');
  assert.match(workflow, /GITHUB_REF: \$\{\{ github\.ref \}\}/);
  assert.match(workflow, /GITHUB_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /node scripts\/wait-for-experimental-ci\.cjs/);
});

test('the exact public ZIP is independently verified before the upload step', () => {
  const verify = workflow.indexOf('name: Verify exact public ZIP before upload (not deployment)');
  const upload = workflow.indexOf('name: Upload only public HTML and integrity manifest for review (not deployment)');
  assert.ok(verify >= 0, 'public ZIP verification step is required');
  assert.ok(upload > verify, 'upload must occur after independent ZIP verification');
  assert.match(workflow, /cd "\$RUNNER_TEMP\/dadyar-preview-handoff\/public"/);
  assert.match(workflow, /zip -q -X "\$archive" index\.html INTEGRITY\.json/);
  assert.match(workflow, /node scripts\/verify-public-preview-artifact\.cjs "\$archive" "\$GITHUB_SHA"/);
});

test('only the two allowlisted public files are uploaded; operator handoff is excluded', () => {
  const uploadBlock = workflow.slice(workflow.indexOf('name: Upload only public HTML and integrity manifest for review (not deployment)'));
  assert.match(uploadBlock, /dadyar-preview-handoff\/public\/index\.html/);
  assert.match(uploadBlock, /dadyar-preview-handoff\/public\/INTEGRITY\.json/);
  assert.doesNotMatch(uploadBlock, /dadyar-preview-handoff\/handoff(?:\/|\s)/);
  assert.doesNotMatch(uploadBlock, /PREVIEW-METADATA\.json|README-fa\.txt|SHA256SUMS/);
});

test('review artifact workflow contains no hosting or deployment command', () => {
  assert.doesNotMatch(workflow, /\b(?:scp|sftp|rsync|ssh|ftp|wrangler|netlify deploy|vercel deploy)\b/i);
  assert.doesNotMatch(workflow, /git push|public_html|cpanel|solidcp/i);
});
