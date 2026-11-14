'use strict';
// Synthetic repository-policy regression. This does not certify GitHub's
// runners or third-party action code, but prevents floating action tags.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');

test('experimental CI actions are pinned to reviewed immutable commit IDs', () => {
  const references = [...workflow.matchAll(/^\s*- uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)].map(m => m[1]);
  assert.equal(references.length, 2, 'unexpected action must be reviewed before CI use');
  assert.deepEqual(references, [
    'actions/checkout@f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a',
    'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1'
  ]);
  for (const ref of references) {
    assert.match(ref, /^[\w-]+\/[\w-]+@[0-9a-f]{40}$/);
  }
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /package-manager-cache:\s*false/);
  assert.match(workflow, /node-version:\s*'22'/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /- dadyar\/mvp-sync-028/);
  assert.doesNotMatch(workflow, /^\s*(?:deploy|secrets|environment):/mi);
});
