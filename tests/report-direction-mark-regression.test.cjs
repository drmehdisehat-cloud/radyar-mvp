'use strict';
// Synthetic-only regression: exported case narratives must not contain
// invisible direction marks capable of misleading a reader of the report.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({
  $: () => ({}),
  state: {
    topic: 'theft', role: 'شاهد',
    story: 'شرح\u061C\u200B\u200E\u200F\u2060\uFEFF ساختگی\nموضوع: عنوان جعلی',
    answers: ['نیم‌فاصله‌ و 👩‍⚖️', 'پاسخ ساختگی', 'پاسخ ساختگی', 'پاسخ ساختگی', 'پاسخ ساختگی']
  }
});
for (const file of ['flows.js', 'export.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
}

test('export strips invisible direction marks while preserving Persian and multiline attribution', () => {
  const text = vm.runInContext('report()', ctx);
  for (const marker of ['\u061C', '\u200B', '\u200E', '\u200F', '\u2060', '\uFEFF']) {
    assert.equal(text.includes(marker), false, 'invisible marker U+' + marker.codePointAt(0).toString(16));
  }
  assert.match(text, /│ موضوع: عنوان جعلی/);
  assert.doesNotMatch(text, /\nموضوع: عنوان جعلی/);
  assert.ok(text.includes('نیم‌فاصله‌ و 👩‍⚖️'), 'legitimate Persian ZWNJ and emoji must survive');
});

test('legal-source titles reject invisible Arabic and direction marks', () => {
  const good = { title: 'قانون آزمایشی', url: 'https://qavanin.ir/Law/TreeText/?IDS=1', checked: '2026-10-21' };
  ctx.candidate = good;
  assert.equal(vm.runInContext('safeLawSource(candidate)', ctx), true);
  for (const marker of ['\u061C', '\u200E', '\u200F']) {
    ctx.candidate = { ...good, title: good.title + marker + 'جعلی' };
    assert.equal(vm.runInContext('safeLawSource(candidate)', ctx), false);
  }
});
