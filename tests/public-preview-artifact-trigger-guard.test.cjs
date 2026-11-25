'use strict';

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

test('public preview artifact workflow is push-only, not PR- or manually-triggered', () => {
  const block = triggerBlock();
  const events = [...block.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)]
    .map(match => match[1]);

  assert.deepEqual(events, ['push']);
  assert.doesNotMatch(
    block,
    /^\s*(?:pull_request|pull_request_target|workflow_dispatch|workflow_run|schedule|release):/m
  );
});

test('public preview artifact workflow accepts pushes only from the exact experimental branch', () => {
  const block = triggerBlock();
  const push = block.match(/^  push:\s*\r?\n([\s\S]*)$/m);
  assert.ok(push, 'push trigger must be explicit');

  const branches = [...push[1].matchAll(/^      - ([^\s#]+)\s*$/gm)]
    .map(match => match[1]);
  assert.deepEqual(branches, ['dadyar/ai-chat-private-20261101']);
  assert.doesNotMatch(push[1], /^\s*(?:tags|tags-ignore|branches-ignore):/m);
});

test('review artifact workflow remains read-only and has no secret or deployment context', () => {
  assert.match(workflow, /^permissions:\r?\n  contents: read\r?\n  checks: read\r?\n  actions: read\r?$/m);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i);
  assert.doesNotMatch(workflow, /^\s*(?:environment|deployment):/mi);
  assert.doesNotMatch(workflow, /id-token:\s*write|contents:\s*write|actions:\s*write/i);
});


test('public artifact uploads exactly the two public files and never the operator handoff', () => {
  const uploadStepMatch = workflow.match(
    /^      - name: Upload only public HTML and integrity manifest for review \(not deployment\)[\\s\\S]*$/m
  );
  assert.ok(uploadStepMatch, 'the public-only upload step must remain explicit');
  const uploadStep = uploadStepMatch[0];
  assert.equal((workflow.match(/uses: actions\\/upload-artifact@/g) || []).length, 1,
    'the workflow must have exactly one artifact upload');
  assert.match(uploadStep, /if-no-files-found: error/);
  assert.match(uploadStep, /retention-days: 7/);
  const uploadedPaths = uploadStep.split(/\\r?\\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('${{ runner.temp }}/'));
  assert.deepEqual(uploadedPaths, [
    '${{ runner.temp }}/dadyar-preview-handoff/public/index.html',
    '${{ runner.temp }}/dadyar-preview-handoff/public/INTEGRITY.json'
  ]);
  assert.doesNotMatch(uploadStep, /handoff\\/|PREVIEW-METADATA|README-fa|SHA256SUMS|\\.env|\\$\\{\\{\\s*secrets\\./i);

  const verifyStep = workflow.match(
    /^      - name: Verify exact public ZIP before upload \\(not deployment\\)[\\s\\S]*?(?=^      - name: |$)/m
  );
  assert.ok(verifyStep, 'the exact public ZIP verifier must run before upload');
  assert.ok(verifyStep.index < workflow.indexOf(uploadStep),
    'the exact ZIP verifier must precede artifact upload');
  assert.match(verifyStep[0], /cd "\$RUNNER_TEMP\\/dadyar-preview-handoff\\/public"/);
  assert.match(verifyStep[0], /zip -q -X "\$archive" index\\.html INTEGRITY\\.json/);
});
