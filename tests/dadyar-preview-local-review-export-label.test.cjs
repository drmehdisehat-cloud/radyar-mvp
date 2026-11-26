'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('download action is visibly labelled as a local demo, not an authenticated review report', () => {
  const match = html.match(/<button\\b[^>]*id="download"[^>]*>[\\s\\S]*?<\\/button>/);
  assert.ok(match, 'report download button must exist');
  assert.match(match[0], /aria-describedby="export-status"/);
  assert.match(match[0], /گزارش آزمایشی/);
  assert.match(match[0], /بازبینی محلی/);
});

test('local review limitations remain adjacent to the export action', () => {
  const reviewStart = html.indexOf('<section id="human-review"');
  const downloadStart = html.indexOf('<button type="button" id="download"', reviewStart);
  assert.ok(reviewStart >= 0 && downloadStart > reviewStart, 'review and export controls must exist');
  const review = html.slice(reviewStart, downloadStart);
  assert.match(review, /هویت یا سمت بازبین احراز نمی‌شود/);
  assert.match(review, /تأیید حقوقی یا مجوز انتشار نیست/);
  assert.match(review, /ثبت اظهار محلی بازبین/);
});

test('the exported review record explicitly states that identity was not authenticated', () => {
  const handlerStart = html.indexOf("document.getElementById('download').addEventListener");
  assert.ok(handlerStart >= 0, 'download handler must exist');
  const handler = html.slice(handlerStart);
  assert.match(handler, /اظهار محلی؛ هویت احراز نشده/);
  assert.match(handler, /تأیید حقوقی یا احراز هویت محسوب نمی‌شود/);
});
