'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('offline preview exposes its unauthenticated, non-operational boundary before the workflow begins', () => {
  const banner = html.match(/<p id="preview-release-status" role="alert">([\\s\\S]*?)<\\/p>/);
  assert.ok(banner, 'a visible top-level release-boundary alert is required');
  assert.ok(html.indexOf(banner[0]) < html.indexOf('<section'), 'the warning must appear before any user workflow');
  assert.match(banner[1], /پیش‌نمایش آفلاین و غیرعملیاتی/);
  assert.match(banner[1], /فقط داده ساختگی وارد کنید/);
  assert.match(banner[1], /هویت بازبین احراز نمی‌شود/);
  assert.match(banner[1], /تأیید حقوقی یا مجوز انتشار ایجاد نمی‌کند/);
  assert.doesNotMatch(banner[0], /hidden(?:=|\\s|>)/i);
});
