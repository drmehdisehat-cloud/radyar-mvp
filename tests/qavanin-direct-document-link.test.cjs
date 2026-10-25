'use strict';
// Synthetic-only structural citation check. This does NOT validate legal content.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({ $: () => ({}) });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'export.js'), 'utf8'), ctx);
function safe(url) {
  ctx.candidate = { title: 'متن ساختگی برای آزمون', url, checked: '2026-10-24' };
  return vm.runInContext('safeLawSource(candidate)', ctx);
}
test('qavanin source metadata requires a direct numeric law document identifier', () => {
  assert.equal(safe('https://qavanin.ir/Law/TreeText/?IDS=123456'), true);
  for (const url of [
    'https://qavanin.ir/Law/TreeText/',
    'https://qavanin.ir/Law/TreeText/?IDS=',
    'https://qavanin.ir/Law/TreeText/?IDS=not-a-law',
    'https://qavanin.ir/Law/TreeText/?IDS=1&next=other',
    'https://qavanin.ir/Law/TreeText/?IDS=1#fragment',
    'https://qavanin.ir/unrelated/page?IDS=123',
    'https://qavanin.ir/Law/TreeText/extra?IDS=123',
  ]) assert.equal(safe(url), false, 'must reject non-document citation: ' + url);
});
