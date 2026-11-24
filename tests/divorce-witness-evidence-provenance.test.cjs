'use strict';
// Synthetic-only divorce witness intake contract. No case facts, legal findings,
// credibility assessments or real identifying information.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('divorce witness separates direct observations, hearsay and later documents', () => {
  const questions = questionsFor('divorce', 'شاهد');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'شخصاً دیده یا شنیده‌اید', 'بازه زمانی', 'شرایطی حضور داشته‌اید',
    'از دیگران شنیده‌اید', 'مشاهده مستقیم', 'فقط بعداً پیام، تصویر، سند یا ابلاغیه‌ای',
    'منشأ دسترسی قانونی', 'شهادت مستقیم', 'اصل مدارک را بدون تغییر'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing divorce witness evidence boundary: ' + phrase);
  }
});

test('divorce witness protects minors and avoids unreviewed legal conclusions', () => {
  const prompt = questionsFor('divorce', 'شاهد').at(-1);
  for (const phrase of [
    'فقط تعداد و رده سنی', 'نام، مدرسه، نشانی، اطلاعات پزشکی یا هویتی کودک',
    'اشخاص ثالث', 'شماره پرونده', 'کد ملی', 'شماره حساب یا کارت',
    'شماره تماس', 'رمز و کد تأیید', 'خطر فوری',
    'بدون جزئیات شناسایی‌کننده', 'اعتبار شهادت', 'مبنای قانونی طلاق',
    'وضعیت حضانت', 'حقوق مالی', 'تأیید حقوقی انسانی ضروری است'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing divorce witness privacy/review safeguard: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل']) {
    assert.doesNotMatch(questionsFor('divorce', role).at(-1), /منشأ دسترسی قانونی/);
  }
  assert.equal(Object.hasOwn(flows.divorce, 'source'), false);
  assert.equal(Object.hasOwn(flows.divorce, 'jurisdiction'), false);
});
