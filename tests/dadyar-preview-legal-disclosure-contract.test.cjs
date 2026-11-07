'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('synthetic cheque preview does not imply verified legal authority or real professional action', () => {
  assert.match(html, /منابع قانونی: تأییدنشده؛ هیچ استناد قانونی ارائه نمی‌شود/);
  assert.match(html, /تاریخ واقعی احراز نشده است/);
  assert.match(html, /این متن رأی، سند رسمی یا دستور انتظامی نیست/);
  assert.match(html, /نقش کمک‌یار/);
  assert.match(html, /اطلاعات واقعی وارد نکنید/);
  assert.doesNotMatch(html, /<a\b/i, 'unreviewed legal links must not be presented as sources');
});

test('synthetic export labels human self-review without claiming specialist approval', () => {
  assert.match(html, /شخصاً این پیش‌نویس فرضی را بازبینی کرده‌ام/);
  assert.match(html, /به معنای تأیید قانونی، اصالت مدارک یا بررسی مستقل متخصص نیست/);
  assert.match(html, /exportEligible=conflicts\.length===0 && unresolved\.length===0/);
});
