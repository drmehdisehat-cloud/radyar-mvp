'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.resolve(
  __dirname,
  '../.github/workflows/public-preview-review-artifact.yml'
);
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('public review artifact workflow is push-only and read-only', () => {
  assert.match(
    workflow,
    /^on:\s*\n\s+push:\s*\n\s+branches:\s*\n\s+- dadyar\/ai-chat-private-20261101\s*$/m
  );
  assert.doesNotMatch(workflow, /^\s+(pull_request|pull_request_target|workflow_dispatch|schedule):/m);
  assert.match(workflow, /^permissions:\s*\n\s+contents:\s*read\s*$/m);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
});

test('review artifact uploads exactly the two public files and binds the source SHA', () => {
  const marker = '- name: Upload only public HTML and integrity manifest for review (not deployment)';
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'public-only upload step missing');
  const nextStep = workflow.indexOf('\n      - name:', start + marker.length);
  const block = workflow.slice(start, nextStep === -1 ? workflow.length : nextStep);

  const paths = [...block.matchAll(
    /^\s+\$\{\{\s*runner\.temp\s*\}\}\/dadyar-preview-handoff\/public\/(.+)$/gm
  )].map(match => match[1]).sort();

  assert.deepEqual(paths, ['INTEGRITY.json', 'index.html']);
  assert.match(block, /name:\s*dadyar-public-preview-review-\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(block, /if-no-files-found:\s*error/);
  assert.match(block, /retention-days:\s*7/);
  assert.match(block, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.doesNotMatch(block, /PREVIEW-METADATA|README-fa|SHA256SUMS|restore-evidence|\.env|secrets\./i);
});

test('review artifact workflow cannot deploy or receive repository secrets', () => {
  assert.equal((workflow.match(/actions\/upload-artifact@/g) || []).length, 1);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i);
  assert.doesNotMatch(workflow, /id-token:\s*write|contents:\s*write/i);
  assert.doesNotMatch(workflow, /actions\/deploy-pages|appleboy\/ssh-action|scp-action|rsync|\bscp\b/i);
  assert.doesNotMatch(workflow, /^\s{2}[a-z0-9_-]*deploy[a-z0-9_-]*:\s*$/im);
});
