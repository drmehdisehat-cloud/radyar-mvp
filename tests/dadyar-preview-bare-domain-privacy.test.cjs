'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dadyar-preview', 'index.html'), 'utf8');
const expression = html.match(/^ const hasSensitiveIdentifier=(.*);$/m);
assert.ok(expression, 'preview must expose the local sensitive-identifier guard');

function isSensitive(freeQuestion) {
  // Evaluate the exact production guard, not a duplicated test regex.
  return vm.runInNewContext(expression[1], {
    freeQuestion,
    compactIdentifierDigits: freeQuestion
  });
}

test('bare domain and path are rejected before report export', () => {
  for (const input of ['example.com/case', 'example.ir', 'www.example.com/case', 'https://example.com/case', 'پرونده.example.ir']) {
    assert.equal(isSensitive(input), true, input);
  }
});
test('ordinary fictional cheque question remains accepted', () => {
  assert.equal(isSensitive('در این چک فرضی چه مدارکی باید بررسی شوند؟'), false);
});
