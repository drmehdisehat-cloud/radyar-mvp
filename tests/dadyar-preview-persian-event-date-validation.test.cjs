'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'offline preview inline script must exist');

function parseDate() {
  const start = script.indexOf('function parseSyntheticEventDateInput(value){');
  const end = script.indexOf('\nupdateFreeQuestionCounter();', start);
  assert.ok(start >= 0 && end > start, 'Persian event-date parser boundary must remain explicit');
  const sandbox = {};
  vm.runInNewContext(
    script.slice(start, end) + '\nglobalThis.__parse = parseSyntheticEventDateInput;',
    sandbox,
    { timeout: 1000 }
  );
  return sandbox.__parse;
}

test('Persian and Arabic-Indic digits normalize to the same synthetic event date', () => {
  const parse = parseDate();
  assert.deepEqual({ ...parse('۱۴۰۵/۰۱/۰۱') }, { formatValid: true, normalized: '1405-01-01' });
  assert.deepEqual({ ...parse('١٤٠٥/٠١/٠١') }, { formatValid: true, normalized: '1405-01-01' });
  assert.deepEqual({ ...parse('1405-01-01') }, { formatValid: true, normalized: '1405-01-01' });
});

test('Persian leap-day validation accepts Esfand 30 only in the ICU-recognized leap year', () => {
  const parse = parseDate();
  assert.deepEqual({ ...parse('۱۴۰۳/۱۲/۳۰') }, { formatValid: true, normalized: '1403-12-30' });
  assert.deepEqual({ ...parse('۱۴۰۴/۱۲/۳۰') }, { formatValid: false, normalized: '' });
});

test('impossible Persian month/day and out-of-range years fail closed', () => {
  const parse = parseDate();
  for (const value of [
    '۱۴۰۵/۰۰/۰۱',
    '۱۴۰۵/۱۳/۰۱',
    '۱۴۰۵/۱۲/۳۱',
    '۱۴۰۵/۰۱/۰۰',
    '۱۲۹۹/۰۱/۰۱',
    '۱۵۰۱/۰۱/۰۱',
    '۱۴۰۵.۰۱.۰۱',
    '۱۴۰۵-۱-۰۱',
    'not-a-date'
  ]) {
    assert.deepEqual({ ...parse(value) }, { formatValid: false, normalized: '' }, value);
  }
});

test('empty optional event date remains distinct from an invalid supplied date', () => {
  const parse = parseDate();
  assert.deepEqual({ ...parse('   ') }, { formatValid: true, normalized: '' });
  assert.deepEqual({ ...parse('۱۴۰۵/۱۳/۰۱') }, { formatValid: false, normalized: '' });
});

test('calendar-shape validation never claims to select the legally applicable statute version', () => {
  assert.match(html, /انطباق با تقویم رسمی ایران یا نسخه لازم‌الاجرای قانون را اثبات نمی‌کند/);
  assert.match(script, /انتخاب نسخه قانون بر اساس تاریخ واقعه: انجام نشد/);
  assert.match(script, /منبع رسمی و بازبینی انسانی تأیید نشده‌اند/);
});
