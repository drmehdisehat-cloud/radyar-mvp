'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dadyar-preview', 'index.html'), 'utf8');

test('offline reviewer identity is a fixed synthetic label and cannot solicit a real name', () => {
  const match = html.match(/<input\\b[^>]*\\bid="reviewer-name"[^>]*>/);
  assert.ok(match, 'reviewer label input must exist');
  const field = match[0];
  assert.match(field, /\\bvalue="بازبین آزمون"/);
  assert.match(field, /\\breadonly(?:\\s|>|=)/i);
  assert.match(field, /\\baria-readonly="true"/i);
  assert.match(field, /\\brequired(?:\\s|>|=)/i);
  assert.doesNotMatch(field, /\\bplaceholder=/i);
});

test('offline review remains explicitly unauthenticated and non-legal', () => {
  assert.match(html, /بازبینی محلی توسط انسان \\(بدون احراز هویت\\)/);
  assert.match(html, /این مرحله فقط جریان بازبینی آفلاین را نمایش می‌دهد/);
  assert.match(html, /هویت بازبین احراز نمی‌شود/);
  assert.match(html, /این اظهار به معنای تأیید قانونی/);
});

test('offline preview remains disconnected from APIs and remote form submission', () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
});
