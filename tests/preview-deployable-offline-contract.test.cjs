'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('deployable preview is a self-contained, offline Persian cheque fixture', () => {
  assert.match(html, /<html lang="fa" dir="rtl">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.doesNotMatch(html, /<script\s+[^>]*src\s*=|<link\s+[^>]*href\s*=|fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon\s*\(/i);
  assert.match(html, /id="free-question"/);
  assert.match(html, /id="export-ack"/);
  assert.match(html, /id="download" disabled/);
  assert.match(html, /exportEligible=conflicts\.length===0 && unresolved\.length===0/);
  assert.match(html, /downloadButton\.disabled=!exportEligible \|\| !exportAck\.checked/);
  assert.match(html, /exportAck\.checked=false;updateExportPermission\(\)/);
  assert.match(html, /منابع قانونی: تأییدنشده/);
  assert.match(html, /prefers-reduced-motion/);
});

test('preview never implies a public AI or verified legal opinion', () => {
  assert.match(html, /بدون ارسال اطلاعات، هوش مصنوعی/);
  assert.match(html, /پاسخ خودکار حقوقی: ارائه نمی‌شود/);
  assert.match(html, /این متن رأی، سند رسمی یا دستور انتظامی نیست/);
});
