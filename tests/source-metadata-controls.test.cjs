'use strict';
// Synthetic-only regression: an official-domain link is not proof of legal validity.
// Reject invisible/bidi/terminal controls in trusted citation metadata.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({ $: () => ({}) });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'export.js'), 'utf8'), ctx);
const source = { title: 'قانون آزمایشی', url: 'https://qavanin.ir/Law/TreeText/?IDS=1', checked: '2026-10-21' };
const check = candidate => { ctx.candidate = candidate; return vm.runInContext('safeLawSource(candidate)', ctx); };
assert.equal(check(source), true, 'ordinary synthetic metadata should remain valid');
let rejected = 0;
for (const bad of ['\n', '\r', '\u0085', '\u2028', '\u2029', '\u202e', '\u2066', '\u2069', '\u200b', '\u0000', '\u001b', '\u007f', '\ufeff']) {
  for (const field of ['title', 'url']) {
    const candidate = { ...source, [field]: source[field] + bad + 'متن ساختگی' };
    assert.equal(check(candidate), false, `control U+${bad.codePointAt(0).toString(16)} in ${field}`);
    rejected++;
  }
}
assert.equal(check({ ...source, title: 'قانون ساختگی با نیم‌فاصله' }), true,
  'Persian ZWNJ in an ordinary source title should remain valid');
for (const title of ['!!!', '😀', '\u200c', '...  ؟!']) {
  assert.equal(check({ ...source, title }), false,
    'nonsemantic source titles must not appear as trusted legal citations');
}
assert.equal(check({ ...source, title: 'ماده ۱۰۴ (اصلاحی)' }), true,
  'Persian legal titles containing digits and punctuation are valid');
assert.equal(check({ ...source, title: 'Civil Code 1082' }), true,
  'Latin titles containing legal identifiers are valid');
console.log(`PASS: ${rejected} unsafe metadata controls and 4 nonsemantic titles rejected; semantic titles accepted`);
