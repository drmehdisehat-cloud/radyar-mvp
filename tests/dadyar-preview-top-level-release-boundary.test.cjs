'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('offline preview exposes its unauthenticated, non-operational boundary before the workflow begins', () => {
  const openTag = '<p id="preview-release-status" role="alert">';
  const start = html.indexOf(openTag);
  assert.notEqual(start, -1, 'a visible top-level release-boundary alert is required');
  const close = html.indexOf('</p>', start);
  assert.notEqual(close, -1, 'the release-boundary alert must be a complete paragraph');
  const banner = html.slice(start, close + 4);
  assert.ok(start < html.indexOf('<section'), 'the warning must appear before any user workflow');
  assert.match(banner, /پیش‌نمایش آفلاین و غیرعملیاتی/);
  assert.match(banner, /فقط داده ساختگی وارد کنید/);
  assert.match(banner, /هویت بازبین احراز نمی‌شود/);
  assert.match(banner, /تأیید حقوقی یا مجوز انتشار ایجاد نمی‌کند/);
  assert.ok(!banner.includes(' hidden'), 'the release-boundary alert must not be hidden');
});
