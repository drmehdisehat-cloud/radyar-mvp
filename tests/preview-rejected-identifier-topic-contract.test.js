'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'dadyar-preview', 'index.html'), 'utf8');

test('rejected personal identifier cannot influence visible topic labels', () => {
  assert.match(html, /const displayQuestion=hasSensitiveIdentifier\s*\n\s*\?'نامشخص؛ شناسه حساس احتمالی شناسایی شد و متن ورودی حذف شد'/);
  assert.match(html, /internalTopicMatches=hasSensitiveIdentifier\?\[\]:classifyQuestion\(freeQuestion\)/);
  assert.match(html, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
});
test('suspected identifier still blocks export and clears the input', () => {
  assert.match(html, /let freeQuestion=freeQuestionField\.value\.trim\(\);[\s\S]*?freeQuestionField\.value='';/);
  assert.match(html, /if\(hasSensitiveIdentifier\) conflicts\.push\(/);
  assert.match(html, /exportEligible=conflicts\.length===0 && unresolved\.length===0/);
  assert.doesNotMatch(html, /report\s*=\s*\[[^\]]*freeQuestion/);
});
