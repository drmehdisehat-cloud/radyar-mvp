'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('preview discloses missing primary-source and event-date verification before the workflow', () => {
  const marker = '<p id="legal-source-status" role="note">';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, 'a visible legal-source status notice is required');
  const end = html.indexOf('</p>', start);
  assert.notEqual(end, -1, 'the legal-source status notice must be a complete paragraph');
  const notice = html.slice(start, end + 4);
  assert.ok(start < html.indexOf('<section'), 'the source warning must appear before the user workflow');
  assert.match(notice, /هیچ منبع رسمیِ احراز‌شده/);
  assert.match(notice, /متن خام سند و SHA-256/);
  assert.match(notice, /پیوند مستقیم/);
  assert.match(notice, /نسخه معتبر در تاریخ واقعه/);
  assert.match(notice, /بازبینی انسانی مستقل/);
  assert.match(notice, /تاریخ واقعه نیز در سناریوی ساختگی تعیین نشده است/);
  assert.match(notice, /هیچ پاسخ یا استناد حقوقی قطعی ارائه نمی‌شود/);
  assert.doesNotMatch(notice, /منبع تأییدشده است/);
});

test('legal-source notice remains visible and is not hidden behind the generated report', () => {
  const start = html.indexOf('<p id="legal-source-status" role="note">');
  const end = html.indexOf('</p>', start);
  const notice = html.slice(start, end + 4);
  assert.doesNotMatch(notice, /\shidden(?:=|\s|>)/i);
  assert.doesNotMatch(notice, /display\s*:\s*none/i);
});
