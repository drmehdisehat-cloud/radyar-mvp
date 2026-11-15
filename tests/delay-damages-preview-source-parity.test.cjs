'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dadyar-preview/index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'dadyar-preview/data/delay-damages-index.json'), 'utf8'));

function attribute(name) {
  const marker = name + '=';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, 'missing preview calculator attribute: ' + name);
  const valueStart = start + marker.length;
  const quote = html[valueStart];
  assert.ok(quote === '"' || quote === "'", 'attribute must be quoted: ' + name);
  const end = html.indexOf(quote, valueStart + 1);
  assert.notEqual(end, -1, 'unterminated preview calculator attribute: ' + name);
  return html.slice(valueStart + 1, end);
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
  assert.ok(html.includes('ماه شاخص مبدأ (انتخاب آزمایشی، نه تعیین قانونی)'));
  assert.ok(html.includes('ماه شاخص پرداخت / محاسبه (انتخاب آزمایشی)'));
  assert.ok(html.includes('مبدأ قانونی ماده ۵۲۲ یا شرایط مطالبه را تعیین نمی‌کند'));
  assert.ok(html.includes('منبع داده: تصویر مالک؛ تأیید رسمی و حقوقی نشده است'));
});

test('unverified source warning remains visible before and after numeric calculation', () => {
  assert.ok(html.includes('هنوز با جدول رسمی بانک مرکزی تطبیق مستقل نشده‌اند'));
  assert.ok(html.includes('صرفاً برای محاسبه عددی آزمایشی است'));
  assert.ok(html.includes('منبع داده: تصویر مالک؛ تأیید رسمی و حقوقی نشده است'));
});
