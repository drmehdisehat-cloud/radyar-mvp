'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const parserSource = html.match(/function parseSyntheticEventDateInput\(value\)\{[\s\S]*?\n\}/)?.[0];

function parse(value, globals = {}) {
  assert.ok(parserSource, 'synthetic event-date parser missing');
  const sandbox = { ...globals };
  vm.runInNewContext(parserSource + '\nglobalThis.__parse = parseSyntheticEventDateInput;', sandbox, { timeout: 1000 });
  const result = sandbox.__parse(value);
  return { formatValid: result.formatValid, normalized: result.normalized };
}

test('synthetic Jalali event date accepts Persian, Arabic and Latin digits with either separator', () => {
  assert.deepEqual(parse('۱۴۰۵-۰۹-۰۳'), { formatValid: true, normalized: '1405-09-03' });
  assert.deepEqual(parse('١٤٠٥/٠٩/٠٣'), { formatValid: true, normalized: '1405-09-03' });
  assert.deepEqual(parse('1405/09/03'), { formatValid: true, normalized: '1405-09-03' });
  assert.deepEqual(parse(''), { formatValid: true, normalized: '' });
});

test('event-date format guard rejects malformed and out-of-range month/day values', () => {
  for (const value of ['1405-13-03', '1405-00-03', '1405-09-00', '1405-09-32', '1405/9/03', '1405-09', '1400-12-30', '1403-07-31']) {
    assert.deepEqual(parse(value), { formatValid: false, normalized: '' }, value);
  }
});

test('uses the ICU Persian calendar to validate leap-day shape without claiming official Iranian calendar authority', () => {
  assert.deepEqual(parse('1403-12-30'), { formatValid: true, normalized: '1403-12-30' });
  assert.deepEqual(parse('1400-12-30'), { formatValid: false, normalized: '' });
  assert.match(html, /تقویم فارسی ICU مرورگر/);
  assert.match(html, /انطباق با تقویم رسمی ایران/);
  assert.match(html, /تاریخ واردشده برای انتخاب نسخه قانون استفاده نمی‌شود/);
});

test('fails closed when the runtime does not expose the Persian ICU calendar', () => {
  assert.deepEqual(parse('1405-09-03', { Intl: undefined }), { formatValid: false, normalized: '' });
});

test('entered event date is reported as synthetic input but never selects a legal version', () => {
  assert.match(html, /id="event-date"/);
  assert.match(html, /id="event-date"[^>]*dir="ltr"[^>]*placeholder="1405-09-03"/);
  assert.match(html, /تاریخ واقعه در سناریوی ساختگی:/);
  assert.match(html, /انتخاب نسخه قانون بر اساس تاریخ واقعه: انجام نشد/);
  assert.match(html, /ورود تاریخ واقعه به‌تنهایی نسخه معتبر قانون را تعیین نمی‌کند/);
  assert.doesNotMatch(html, /resolvePersianLegalVersion|resolveLegalVersion/);
});

test('invalid event-date format is a report conflict and blocks export', () => {
  assert.match(html, /if\(!eventDateResult\.formatValid\) conflicts\.push/);
  assert.match(html, /exportEligible=conflicts\.length===0 && unresolved\.length===0/);
});

test('event-date input invalidates stale drafts and is cleared on reset/pagehide', () => {
  assert.match(html, /eventDateField\.addEventListener\('input',invalidateDraft\)/);
  assert.match(html, /document\.getElementById\('event-date'\)\.value='';/);
});

test('event date remains local and the preview has no network or browser persistence sink', () => {
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|sendBeacon/);
});
