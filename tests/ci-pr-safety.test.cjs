'use strict';
// Guard the review-CI boundary: PRs may be tested but cannot deploy or gain write access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');

test('review CI covers PRs to main and experimental branch, not pushes to main', () => {
  assert.match(workflow, /\bon:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*- dadyar\/mvp-sync-028\s*\n\s*- dadyar\/preview-auth-policy-20261030\s*\n\s*pull_request:\s*\n\s*branches:\s*\n\s*- main\s*\n\s*- dadyar\/mvp-sync-028/);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /github\.base_ref == 'main'/);
  assert.match(workflow, /github\.base_ref == 'dadyar\/mvp-sync-028'/);
  assert.match(workflow, /github\.event_name == 'push' && \(github\.ref == 'refs\/heads\/dadyar\/mvp-sync-028' \|\| github\.ref == 'refs\/heads\/dadyar\/preview-auth-policy-20261030'\)/);
  assert.doesNotMatch(workflow, /\bpull_request_target\s*:/);
});

test('PR CI stays read-only with no credentials persisted or deployment steps', () => {
  assert.match(workflow, /^permissions:\s*\n\s*contents: read\s*$/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /^\s*(?:contents|actions|id-token|packages): write\s*$/m);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /^\s*(?:deploy|environment|workflow_dispatch):/m);
});
