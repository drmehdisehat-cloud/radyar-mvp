'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8'
);

test('experimental CI keeps only the newest run for the same Git ref', () => {
  const block = workflow.match(/^concurrency:\n([\s\S]*?)(?=^permissions:)/m);
  assert.ok(block, 'top-level concurrency policy is required');
  assert.match(block[1], /^  group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}$/m);
  assert.match(block[1], /^  cancel-in-progress: true$/m);
});

test('concurrency policy does not remove the target experimental push trigger', () => {
  assert.match(workflow, /push:\n    branches:[\s\S]*?      - dadyar\/ai-chat-private-20261101/);
  assert.match(workflow, /pull_request:\n    branches:[\s\S]*?      - main/);
  assert.doesNotMatch(workflow, /^\s*deploy:/m);
});
