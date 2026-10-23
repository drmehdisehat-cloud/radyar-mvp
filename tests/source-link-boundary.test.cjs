'use strict';
// A safe link is not a verified legal citation. This checks only URL display safety.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = { $: () => ({}) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'export.js'), 'utf8'), ctx);
const isSafe = source => vm.runInContext('safeLawSource(candidate)', Object.assign(ctx, { candidate: source }));
const good = { title: 'قانون صدور چک', url: 'https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131', checked: '2026-10-19' };
assert.equal(isSafe(good), true);
assert.equal(isSafe({ ...good, url: 'https://dotic.ir/law' }), true);
assert.equal(isSafe({ ...good, url: 'https://rc.majlis.ir/fa/law' }), true);
for (const url of [
  'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
  'http://qavanin.ir/Law/TreeText/?IDS=1',
  'https://qavanin.ir.evil.example/Law/TreeText/?IDS=1',
  'https://qavanin.ir@evil.example/law',
  'https://qavanin.ir\\@evil.example/law',
  'https://qavanin.ir/Law/TreeText/\nhttps://evil.example',
  'https://qavanin.ir/Law/TreeText/<svg>',
]) assert.equal(isSafe({ ...good, url }), false, `reject unsafe link ${JSON.stringify(url)}`);
for (const invalid of [null, {}, { ...good, checked: 'yesterday' }, { ...good, title: '' }, { ...good, title: 'x'.repeat(161) }]) {
  assert.equal(isSafe(invalid), false);
}
console.log('PASS: official-link display allowlist, 3 positive and 13 negative cases');
