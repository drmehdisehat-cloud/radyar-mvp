'use strict';
// Synthetic metadata regression only. A link review date is not a law's
// effective date and does not establish whether its text is consolidated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({ $: () => ({}) });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'export.js'), 'utf8'), ctx);

function accepted(checked) {
  ctx.candidate = {
    title: 'قانون آزمایشی',
    url: 'https://qavanin.ir/Law/TreeText/?IDS=1',
    checked
  };
  return vm.runInContext('safeLawSource(candidate)', ctx);
}

for (const valid of ['2026-10-19', '2024-02-29', '2025-12-31']) {
  assert.equal(accepted(valid), true, 'valid Gregorian date: ' + valid);
}
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
for (const invalid of [
  '2026-02-30', '2026-13-01', '2026-00-01', '2026-10-32',
  '2025-02-29', tomorrow, '2026-1-9'
]) {
  assert.equal(accepted(invalid), false, 'invalid or future date: ' + invalid);
}
console.log('PASS: 3 valid and 7 invalid/future source metadata dates (not legal validity)');
