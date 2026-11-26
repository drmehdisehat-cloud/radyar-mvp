'use strict';

// Security regression: the downloadable review ZIP is public-facing even though
// it is not a deployment. Keep its trigger, permissions and payload deliberately narrow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(
  __dirname,
  '../.github/workflows/public-preview-review-artifact.yml'
);
const workflow = fs.readFileSync(workflowPath, 'utf8');

function triggerBlock() {
  const match = workflow.match(/^on:\s*\r?\n([\s\S]*?)(?=^permissions:)/m);
  assert.ok(match, 'workflow must declare an explicit trigger block before permissions');
  return match[1];
}

test('public preview review artifact is push-only, never PR- or manually-triggered', () => {
  const block = triggerBlock();
  const events = [...block.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)]
    .map(match => match[1]);

  assert.deepEqual(events, ['push']);
  assert.doesNotMatch(
    block,
    /^\s*(?:pull_request|pull_request_target|workflow_dispatch|workflow_run|schedule|release|repository_dispatch):/m
  );
});

test('public preview artifact accepts pushes only from the exact experimental branch', () => {
  const block = triggerBlock();
  const push = block.match(/^  push:\s*\r?\n([\s\S]*)$/m);
  assert.ok(push, 'push trigger must be explicit');

  const branches = [...push[1].matchAll(/^      - ([^\s#]+)\s*$/gm)]
    .map(match => match[1]);
  assert.deepEqual(branches, ['dadyar/ai-chat-private-20261101']);
  assert.doesNotMatch(push[1], /^\s*(?:tags|tags-ignore|branches-ignore):/m);
});

test('public preview workflow uses read-only permissions and no secrets or deployment context', () => {
  assert.match(
    workflow,
    /^permissions:\r?\n  contents: read\r?\n  checks: read\r?\n  actions: read\r?$/m
  );
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i);
  assert.doesNotMatch(workflow, /^\s*(?:environment|deployment):/mi);
  assert.doesNotMatch(
    workflow,
    /(?:id-token|contents|checks|actions|deployments):\s*write/i
  );
  assert.doesNotMatch(workflow, /\b(?:deploy|upload-pages-artifact|azure\/webapps-deploy)\b/i);
});

test('only the public HTML and integrity manifest can be uploaded', () => {
  const uploads = [...workflow.matchAll(/^\s*uses:\s*actions\/upload-artifact@[^\s#]+/gm)];
  assert.equal(uploads.length, 1, 'exactly one public review artifact upload is expected');

  const start = uploads[0].index;
  const nextStep = workflow.indexOf('\n      - name:', start);
  const block = workflow.slice(start, nextStep === -1 ? undefined : nextStep);
  const pathSection = block.split('path: |')[1]?.split('if-no-files-found:')[0];
  assert.ok(pathSection, 'artifact upload must use an explicit path allowlist');
  const tempExpression = '$' + '{{ runner.temp }}';
  const uploadedPaths = pathSection.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  assert.deepEqual(uploadedPaths, [
    tempExpression + '/dadyar-preview-handoff/public/index.html',
    tempExpression + '/dadyar-preview-handoff/public/INTEGRITY.json'
  ]);
  assert.match(block, /if-no-files-found:\s*error/);
  assert.match(block, /retention-days:\s*7/);
  assert.doesNotMatch(block, /\$\{\{\s*secrets\./i);
});
