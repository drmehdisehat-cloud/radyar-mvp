'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dadyar-preview', 'index.html'), 'utf8');

test('offline Persian mobile preview is self-contained', () => {
  assert.match(html, /<html[^>]+lang="fa"[^>]+dir="rtl"/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.doesNotMatch(html, /<script\s+[^>]*src\s*=/i);
  assert.doesNotMatch(html, /<link\s+[^>]*href\s*=/i);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
});

test('export requires explicit review and revokes permission after edits and download', () => {
  assert.match(html, /id="download" disabled/);
  assert.match(html, /id="export-ack"/);
  assert.match(html, /downloadButton\.disabled=!exportEligible \|\| !exportAck\.checked/);
  assert.match(html, /function invalidateDraft\(\)/);
  assert.match(html, /exportEligible=false; exportAck\.checked=false/);
  assert.match(html, /addEventListener\('input',invalidateDraft\)/);
  assert.match(html, /exportAck\.checked=false;updateExportPermission\(\)/);
  assert.match(html, /exportEligible=conflicts\.length===0 && unresolved\.length===0/);
});

test('synthetic cheque report disclaims unverified legal sources and blocks unsupported export', () => {
  assert.match(html, /منابع قانونی: تأییدنشده/);
  assert.match(html, /تصویر چک نمونه با شماره ساختگی/);
  assert.match(html, /const displayQuestion=hasSensitiveIdentifier\s*\?\s*'نامشخص/);
  assert.match(html, /freeQuestionField\.value='';/);
  assert.match(html, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
  assert.match(html, /هیچ استناد قانونی ارائه نمی‌شود/);
});
