'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('offline cheque preview detects grouped identifiers before report export', () => {
  assert.match(html, /let compactIdentifierDigits=normalizedQuestionDigits\.replace\(/);
  assert.match(html, /hasSensitiveIdentifier=.*\.test\(compactIdentifierDigits\)/);
  assert.match(html, /freeQuestionField\.value='';/);
  assert.match(html, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
  assert.match(html, /exportEligible=conflicts\.length===0 && unresolved\.length===0/);
  const normalize = new Function('freeQuestion',
    html.match(/let normalizedQuestionDigits=([^;]+);/)[0] + '\n' +
    html.match(/let compactIdentifierDigits=([^;]+);/)[0] + '\n' +
    'return compactIdentifierDigits;');
  const detect = new Function('compactIdentifierDigits',
    'return ' + html.match(/const hasSensitiveIdentifier=([^;]+);/)[1].split(' || ')[0] + ';');
  for (const sample of ['۱۲۳ ۴۵۶ ۷۸۹۰', '۱۲۳-۴۵۶-۷۸۹۰', '۰۹۱۲ ۳۴۵ ۶۷۸۹', '٤٢٤٢ ٤٢٤٢ ٤٢٤٢ ٤٢٤٢']) {
    assert.equal(detect(normalize(sample)), true, sample);
  }
  assert.equal(detect(normalize('چک فرضی با تاریخ ۱۴۰۵/۰۸/۱۸')), false);
});
