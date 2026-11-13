'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
test('offline IBAN guard includes invisible marks after IR prefix', () => {
  const line = html.split('\n').find(line => line.includes('let compactIdentifierDigits='));
  assert.ok(line, 'privacy normalization must exist');
  for (const mark of ['\\u200c','\\u200d','\\u200e','\\u200f','\\u2060','\\ufeff']) {
    assert.ok(line.includes(mark), 'missing invisible separator '+mark);
  }
  const compact = s => s.normalize('NFKC')
    .replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06F0))
    .replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660))
    .replace(/(?<![A-Za-z0-9])IR[ \t\r\n\u00a0\u2007\u2009\u202f\u200c\u200d\u200e\u200f\u2060\ufeff\-–—]+(?=\d)/gi,'IR');
  for (const input of ['IR\u200c123456789012345678901234','IR\u2060123456789012345678901234','IR\u200d۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴']) {
    assert.match(compact(input), /(?<![A-Za-z0-9])IR\d{24}(?!\d)/i);
  }
  assert.doesNotMatch(compact('پرسش آموزشی درباره چک فرضی'), /(?<![A-Za-z0-9])IR\d{24}(?!\d)/i);
});
