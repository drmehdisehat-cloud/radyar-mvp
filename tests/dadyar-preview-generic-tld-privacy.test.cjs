'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'dadyar-preview', 'index.html'), 'utf8');
const guard = html.match(/^ const hasSensitiveIdentifier=(.*);$/m);
assert.ok(guard, 'the production privacy guard must be present');
function sensitive(input) {
  return vm.runInNewContext(guard[1], { freeQuestion: input, compactIdentifierDigits: input }, { timeout: 1000 });
}
test('non-allowlisted ASCII TLDs are blocked before report generation', () => {
  for (const input of ['example.app/case', 'example.dev', 'sample.xyz/private', 'example.photography/secret', 'example.com/case']) {
    assert.equal(sensitive(input), true, input);
  }
});
test('ordinary synthetic Persian cheque questions remain permitted', () => {
  for (const input of ['در این چک فرضی چه مدارکی لازم است؟', 'در پرونده فرضی چه کنم؟']) {
    assert.equal(sensitive(input), false, input);
  }
});
