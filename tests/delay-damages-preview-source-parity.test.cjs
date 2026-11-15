'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dadyar-preview/index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'dadyar-preview/data/delay-damages-index.json'), 'utf8'));

function attribute(name) {
  const doubleQuoted = new RegExp('\\\\b' + name + '="([^"]*)"').exec(html);
  const singleQuoted = new RegExp("\\\\b" + name + "='([^']*)'").exec(html);
  const match = doubleQuoted || singleQuoted;
  assert.ok(match, 'missing preview calculator attribute: ' + name);
  return match[1];
}

test('embedded 1405 calculator data and provenance exactly match the canonical JSON record', () => {
  const embedded = JSON.parse(attribute('data-indexes'));
  assert.deepEqual(embedded, data.months);
  assert.equal(Number(attribute('data-base-year')), data.baseYear);
  assert.equal(attribute('data-base-year-status'), data.baseYearStatus);
  assert.equal(attribute('data-source-status'), data.source.status);
  assert.equal(data.seriesType, 'monthly-index-points');
  assert.equal(data.source.status, 'transcribed-not-independently-authenticated');
  assert.deepEqual(data.unavailableMonths, [8, 9, 10, 11, 12]);
});

test('calculator labels do not imply that the user-selected index month is a legal start date', () => {
  assert.match(html, /ماه شاخص مبدأ \\(انتخاب آزمایشی، نه تعیین قانونی\\)/);
  assert.match(html, /ماه شاخص پرداخت \/ محاسبه \\(انتخاب آزمایشی\\)/);
  assert.match(html, /مبدأ قانونی ماده ۵۲۲ یا شرایط مطالبه را تعیین نمی‌کند/);
  assert.match(html, /منبع داده: تصویر مالک؛ تأیید رسمی و حقوقی نشده است/);
});

test('unverified source warning remains visible before and after numeric calculation', () => {
  assert.match(html, /هنوز با جدول رسمی بانک مرکزی تطبیق مستقل نشده‌اند/);
  assert.match(html, /صرفاً برای محاسبه عددی آزمایشی است/);
  assert.match(html, /منبع داده: تصویر مالک؛ تأیید رسمی و حقوقی نشده است/);
});
