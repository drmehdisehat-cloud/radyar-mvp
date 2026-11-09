'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'dadyar-preview', 'index.html'), 'utf8');

test('rejected personal identifier cannot influence visible topic labels', () => {
  assert.match(html, /hasSensitiveIdentifier\?'نامشخص؛ پرسش حاوی شناسه احتمالی حذف شد':classifyQuestion\(freeQuestion\)/);
  assert.doesNotMatch(html, /برچسب‌های موضوعی پیشنهادی[^\n]*classifyQuestion\(freeQuestion\)/);
});
test('suspected identifier still blocks export and clears the input', () => {
  assert.match(html, /if\(hasSensitiveIdentifier\) document\.getElementById\('free-question'\)\.value='';/);
  assert.match(html, /if\(hasSensitiveIdentifier\) conflicts\.push\(/);
  assert.match(html, /exportEligible=conflicts\.length===0 && unresolved\.length===0/);
});
