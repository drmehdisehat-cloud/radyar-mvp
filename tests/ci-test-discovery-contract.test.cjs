'use strict';
// Ensure every committed Node contract test is discovered by both read-only CI workflows.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const testFiles = fs.readdirSync(__dirname).filter(name => /\\.test\\.(?:cjs|js)$/.test(name));
const javascriptTests = testFiles.filter(name => name.endsWith('.test.js'));
const workflows = [
  '.github/workflows/ci.yml',
  '.github/workflows/public-preview-review-artifact.yml'
];

test('both experimental CI workflows include JavaScript contract tests in discovery', () => {
  assert.ok(javascriptTests.includes('preview-rejected-identifier-topic-contract.test.js'),
    'the existing privacy regression must remain part of the contract suite');
  for (const relative of workflows) {
    const workflow = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(workflow, /tests=\\(tests\\/\\*\\.test\\.cjs tests\\/\\*\\.test\\.js\\)/,
      relative + ' must discover both CommonJS and JavaScript test suffixes');
    assert.match(workflow, /node --test "\\$\\{contracts\\[@\\]\\}"/,
      relative + ' must execute the discovered contract array');
  }
});
