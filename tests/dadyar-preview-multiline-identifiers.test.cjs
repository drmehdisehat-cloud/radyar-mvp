'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('synthetic cheque free question rejects identifiers split by line breaks and unicode spaces', () => {
  const normalize = new Function('freeQuestion',
    html.match(/const normalizedQuestionDigits=([^;]+);/)[0] + '\n' +
    html.match(/const compactIdentifierDigits=([^;]+);/)[0] +
    '\nreturn compactIdentifierDigits;');
  const detect = new Function('compactIdentifierDigits',
    'return ' + html.match(/const hasSensitiveIdentifier=([^;]+);/)[1].split(' || ')[0] + ';');
  for (const sample of [
    '۰۹۱۲\n۳۴۵\n۶۷۸۹',
    '۱۲۳\r\n۴۵۶\r\n۷۸۹۰',
    '۱۲۳\u2007۴۵۶\u2007۷۸۹۰',
    '۱۲۳\t\n۴۵۶\t\n۷۸۹۰'
  ]) {
    assert.equal(detect(normalize(sample)), true, JSON.stringify(sample));
  }
  assert.equal(detect(normalize('چک فرضی با تاریخ ۱۴۰۵/۰۸/۱۸')), false);
});
