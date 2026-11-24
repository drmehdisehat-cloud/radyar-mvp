'use strict';
// Synthetic-only interview contract. No real case details or legal conclusions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('mehrieh witness distinguishes first-hand knowledge from hearsay and later documents', () => {
  const questions = questionsFor('mehrieh', 'شاهد');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'شخصاً دیده یا مستقیماً شنیده‌اید', 'تحویل سکه یا مال معین',
    'زمان تقریبی', 'شرایط حضور', 'از دیگران شنیده‌اید',
    'بعداً از عقدنامه، رسید، پیام یا سند انتقال',
    'مشاهده مستقیم', 'مشاهده بعدی سند',
    'منشأ دسترسی قانونی', 'اصل مدرک را بدون تغییر'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing evidence provenance: ' + phrase);
  }
});

test('mehrieh witness minimizes identifiers and never asserts legal effect', () => {
  const prompt = questionsFor('mehrieh', 'شاهد').at(-1);
  for (const phrase of [
    'کد ملی', 'شماره پرونده', 'شماره سند ازدواج',
    'شماره کامل حساب یا کارت', 'امضا', 'رمز', 'کد تأیید',
    'اشخاص ثالث', 'صحت بذل یا ابراء', 'اعتبار شهادت',
    'میزان مانده مهریه', 'مرجع صالح', 'مهلت قانونی',
    'تأیید حقوقی انسانی ضروری است'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing privacy/review safeguard: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل']) {
    assert.doesNotMatch(questionsFor('mehrieh', role).at(-1), /منشأ دسترسی قانونی/);
  }
  assert.equal(Object.hasOwn(flows.mehrieh, 'source'), false);
  assert.equal(Object.hasOwn(flows.mehrieh, 'jurisdiction'), false);
});
