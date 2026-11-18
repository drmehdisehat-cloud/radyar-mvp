'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
const marker = '      - name: Create public-only preview payload artifact\n';
const start = workflow.indexOf(marker);
assert.notEqual(start, -1, 'public-only artifact step must exist');
const nextStep = workflow.indexOf('\n      - name: ', start + marker.length);
const step = workflow.slice(start, nextStep < 0 ? workflow.length : nextStep);

test('CI publishes a separate artifact containing only the public index file', () => {
  assert.match(step, /uses: actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7\.0\.2/);
  assert.match(step, /name: dadyar-public-preview-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(step, /path: \$\{\{ runner\.temp \}\}\/dadyar-preview-handoff\/public\/index\.html/);
  assert.match(step, /if-no-files-found: error/);
  assert.match(step, /retention-days: 7/);
  assert.doesNotMatch(step, /handoff\//, 'operator handoff files must not enter the public-only artifact');
  assert.doesNotMatch(step, /\*\*|\/dadyar-preview-handoff\/$/, 'the upload must not use a directory or wildcard');
});

test('public-only artifact is limited to the preview branch and its review PRs', () => {
  assert.match(step, /github\.ref == 'refs\/heads\/dadyar\/ai-chat-private-20261101'/);
  assert.match(step, /github\.event\.pull_request\.head\.ref == 'dadyar\/ai-chat-private-20261101'/);
});

test('workflow retains read-only repository permissions and has no deploy job', () => {
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.doesNotMatch(workflow, /^\s{2}[A-Za-z0-9_-]*deploy[A-Za-z0-9_-]*:/m);
});
