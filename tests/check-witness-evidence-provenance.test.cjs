'use strict';
// Synthetic-only cheque witness intake; no client data or legal conclusions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { questionsFor, flows } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ questionsFor, flows })', {}, { timeout: 1000 }
);

test('cheque witness distinguishes firsthand acts, hearsay and later document review', () => {
  const questions = questionsFor('check', 'شاهد');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'صدور و امضای چک', 'ثبت یا تأیید در صیاد', 'انتقال',
    'ارائه به بانک', 'پرداخت تمام یا بخشی از وجه',
    'زمان تقریبی هر مشاهده', 'شرایط حضور خود',
    'فقط از دیگران شنیده‌اید', 'بعداً از تصویر چک',
    'گواهی عدم پرداخت', 'نوع و زمان تقریبی ثبت',
    'اصل فایل را بدون تغییر'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing witness provenance: ' + phrase);
  }
});

test('cheque witness intake excludes identifiers and premature legal conclusions', () => {
  const prompt = questionsFor('check', 'شاهد').at(-1);
  for (const phrase of [
    'شماره کامل چک، حساب، شناسه صیادی',
    'اطلاعات هویتی اشخاص را وارد نکنید',
    'به‌تنهایی اصالت چک، اعتبار شهادت',
    'مهلت قانونی را تعیین نمی‌کنند'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing witness safety boundary: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل']) {
    assert.doesNotMatch(questionsFor('check', role).at(-1), /شرایط حضور خود/);
  }
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
});
