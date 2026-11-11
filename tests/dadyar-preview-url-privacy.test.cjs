'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
test('synthetic cheque preview rejects external URLs before export', () => {
  assert.match(html, /const hasSensitiveIdentifier=[^\n]*https\?:/);
  assert.match(html, /const displayQuestion=hasSensitiveIdentifier\?/);
  assert.match(html, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
  assert.match(html, /freeQuestionField\.value='';/);
  assert.doesNotMatch(html, /:freeQuestion;/);
  assert.match(html, /exportEligible=conflicts\.length===0 && unresolved\.length===0/);
  assert.match(html, /if\(hasSensitiveIdentifier\) conflicts\.push/);
});
test('URL guard catches explicit web links but not ordinary synthetic questions', () => {
  const urlPattern = /(?:https?:\/\/|www\.)[^\s<>]+/i;
  assert.equal(urlPattern.test('https://example.org/case/123'), true);
  assert.equal(urlPattern.test('www.example.org/private'), true);
  assert.equal(urlPattern.test('در چک فرضی چه مدارکی لازم است؟'), false);
});
