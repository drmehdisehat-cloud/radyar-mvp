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
    'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
    'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'
  ]);
  for (const ref of references) {
    assert.match(ref, /^[\w-]+\/[\w-]+@[0-9a-f]{40}$/);
  }
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /- dadyar\/mvp-sync-028/);
  assert.doesNotMatch(workflow, /^\s*(?:deploy|secrets|environment):/mi);
});
