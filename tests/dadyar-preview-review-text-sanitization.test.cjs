'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const helperSource = html.match(/function safeReviewText\(value,max\)\{[\s\S]*?\n\}/)?.[0];

assert.ok(helperSource, 'offline review text sanitizer must exist');

const context = {};
vm.runInNewContext(helperSource + '\nglobalThis.safeReviewText = safeReviewText;', context, {
  timeout: 1000
});

test('review text cannot inject extra report lines or bidi direction controls', () => {
  const raw = 'بازبین\r\nنتیجه: تأیید\u202e\u2066جعلی\u2069\u0000';
  const safe = context.safeReviewText(raw, 80);

  assert.equal(safe.includes('\n'), false);
  assert.equal(safe.includes('\r'), false);
  assert.equal(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(safe), false);
  assert.equal(safe, 'بازبین نتیجه: تأییدجعلی');
});

test('review text is NFC-normalized, whitespace-collapsed and length-bounded', () => {
  const safe = context.safeReviewText('  Cafe\u0301   بازبین  ', 9);
  assert.equal(safe, 'Café بازب');
  assert.equal(safe.length <= 9, true);
});

test('the report stores only sanitized reviewer name and note values', () => {
  assert.match(html, /reviewer:safeReviewText\(reviewerName\.value,80\)/);
  assert.match(html, /note:safeReviewText\(reviewNote\.value,300\)/);
  assert.match(html, /'نام بازبین: '\+reviewRecord\.reviewer/);
  assert.match(html, /'یادداشت بازبین: '\+\(reviewRecord\.note\|\|'ثبت نشده'\)/);
});
