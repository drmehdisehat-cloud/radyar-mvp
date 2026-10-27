'use strict';
// Synthetic-only debt witness interview contract. Not a legal determination.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { questionsFor, flows } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ questionsFor, flows })', {}, { timeout: 1000 }
);

test('debt witness distinguishes firsthand events, hearsay and later documents', () => {
  const questions = questionsFor('debt', 'شاهد');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'ایجاد تعهد', 'تحویل وجه، کالا یا خدمت', 'پرداخت جزئی',
    'زمان تقریبی', 'شرایط حضور', 'تاریخ را حدس نزنید',
    'فقط از دیگران شنیده‌اید', 'مشاهده بعدی سند',
    'قرارداد، فاکتور، رسید', 'منشأ دسترسی قانونی',
    'اصل سند و پیام را بدون تغییر'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing witness provenance: ' + phrase);
  }
});

test('debt witness avoids identifiers and unsupported conclusions, without leaking into other roles', () => {
  const prompt = questionsFor('debt', 'شاهد').at(-1);
  for (const phrase of [
    'نام، کد ملی', 'نشانی دقیق', 'شماره پرونده',
    'شماره کامل حساب یا کارت', 'رمز، کد تأیید',
    'اطلاعات اشخاص ثالث', 'میزان قطعی دین',
    'اعتبار شهادت', 'خسارت تأخیر', 'مرجع صالح',
    'مهلت قانونی', 'تأیید حقوقی انسانی ضروری است'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing witness privacy/legal safeguard: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل']) {
    assert.doesNotMatch(questionsFor('debt', role).at(-1), /مشاهده بعدی سند/);
  }
  assert.equal(Object.hasOwn(flows.debt, 'source'), false);
});
