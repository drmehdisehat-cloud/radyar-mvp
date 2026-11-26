'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('download action is visibly labelled as a local demo, not an authenticated review report', () => {
  const start = html.indexOf('<button type="button" id="download" disabled');
  const end = html.indexOf('</button>', start);
  assert.ok(start >= 0 && end > start, 'report download button must exist');
  const button = html.slice(start, end + '</button>'.length);
  assert.ok(button.includes('aria-describedby="export-status"'));
  assert.ok(button.includes('گزارش آزمایشی'));
  assert.ok(button.includes('بازبینی محلی'));
});

test('local review limitations remain adjacent to the export action', () => {
  const reviewStart = html.indexOf('<section id="human-review"');
  const downloadStart = html.indexOf('<button type="button" id="download" disabled', reviewStart);
  assert.ok(reviewStart >= 0 && downloadStart > reviewStart, 'review and export controls must exist');
  const review = html.slice(reviewStart, downloadStart);
  assert.ok(review.includes('هویت یا سمت بازبین احراز نمی‌شود'));
  assert.ok(review.includes('تأیید حقوقی یا مجوز انتشار نیست'));
  assert.ok(review.includes('ثبت اظهار محلی بازبین'));
});

test('the exported review record explicitly states that identity was not authenticated', () => {
  const handlerStart = html.indexOf("document.getElementById('download').addEventListener");
  assert.ok(handlerStart >= 0, 'download handler must exist');
  const handler = html.slice(handlerStart);
  assert.ok(handler.includes('اظهار محلی؛ هویت احراز نشده'));
  assert.ok(handler.includes('تأیید حقوقی یا احراز هویت محسوب نمی‌شود'));
});
