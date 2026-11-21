'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/ci.yml'),
  'utf8'
);

test('public preview artifact upload remains gated on a private repository', () => {
  const marker = '- name: Create public-only preview payload artifact';
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'public-only preview artifact step missing');
  const nextStep = workflow.indexOf('\n      - name:', start + marker.length);
  const block = workflow.slice(start, nextStep === -1 ? workflow.length : nextStep);

  assert.match(
    block,
    /if:\s*>-[\s\S]*github\.event\.repository\.private\s*==\s*true/,
    'artifact upload must remain disabled while the repository is public'
  );

  const artifactPaths = [...block.matchAll(/^\s+\$\{\{ runner\.temp \}\}\/dadyar-preview-handoff\/public\/(.+)$/gm)]
    .map(match => match[1]);
  assert.deepEqual(
    artifactPaths.sort(),
    ['INTEGRITY.json', 'index.html'],
    'only the reviewed public HTML and its integrity manifest may be uploaded'
  );
  assert.match(block, /if-no-files-found:\s*error/);
  assert.match(block, /retention-days:\s*7/);
  assert.doesNotMatch(block, /handoff\/|restore-evidence|\.env|secrets\./i);
});

test('experimental CI has read-only repository permission and no deployment job', () => {
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read\b/);
  assert.doesNotMatch(workflow, /^\s{2}[a-z0-9_-]*deploy[a-z0-9_-]*:\s*$/im);
  assert.doesNotMatch(workflow, /actions\/deploy-pages|appleboy\/ssh-action|scp-action/i);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i);
});
