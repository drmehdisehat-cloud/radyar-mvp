'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('offline intake normalizes compatibility numerals before identifier checks', () => {
  assert.match(html, /normalizedQuestionDigits=freeQuestion\.normalize\('NFKC'\)/);
  const normalize = s => s.normalize('NFKC')
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
  const sensitive = /(?<!\d)\d{10}(?!\d)/;
  assert.equal(sensitive.test(normalize('１２３４５６７８９０')), true);
  assert.equal(sensitive.test(normalize('①②③④⑤⑥⑦⑧⑨⓪')), true);
  assert.equal(sensitive.test(normalize('پرسش آموزشی درباره چک فرضی')), false);
});
