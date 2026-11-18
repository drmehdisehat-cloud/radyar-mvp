'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const start = html.indexOf('function hasSensitiveIdentifier(value) {');
assert.notEqual(start, -1, 'shared sensitive-identifier detector must exist');
const end = html.indexOf('\n}', start);
assert.notEqual(end, -1, 'sensitive-identifier detector must close');
const source = html.slice(start, end + 2);

function detector() {
  const sandbox = {};
  vm.runInNewContext(source + '\nglobalThis.__detect = hasSensitiveIdentifier;', sandbox, { timeout: 1000 });
  return sandbox.__detect;
}

test('shared privacy detector catches Iranian identifiers split by Persian punctuation', () => {
  const detect = detector();
  assert.equal(detect('شماره فرضی ۰۹۱۲،۳۴۵،۶۷۸۹'), true, 'Persian comma must not split a mobile number');
  assert.equal(detect('تلفن ثابت فرضی ۰۲۱؛۱۲۳۴۵۶۷۸'), true, 'Arabic semicolon must not split a landline number');
  assert.equal(detect('کارت فرضی ۶۰۳۷،۹۹۱۲،۳۴۵۶،۷۸۹۰'), true, 'Persian comma must not split a 16-digit card number');
  assert.equal(detect('کد فرضی ۰۰۱،۲۳۴،۵۶۷۸'), true, 'Persian comma must not split a 10-digit identifier');
});

test('privacy detector does not reject ordinary short amounts or synthetic cheque text', () => {
  const detect = detector();
  assert.equal(detect('سناریوی چک فرضی، مبلغ ۱۰۰۰۰۰۰۰۰ ریال'), false);
  assert.equal(detect('تاریخ فرضی ۱۴۰۵/۰۸/۲۷ و شماره نمونه ۱۲۳۴'), false);
});

test('free-question path delegates to the same privacy detector before rendering or export', () => {
  assert.match(html, /const sensitiveQuestionDetected\s*=\s*hasSensitiveIdentifier\(freeQuestion\)/);
  assert.match(html, /sensitiveQuestionDetected\s*\?/);
});
