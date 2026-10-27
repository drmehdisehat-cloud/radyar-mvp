'use strict';
// Synthetic-only cheque lawyer interview contract. No case data or legal advice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { questionsFor, flows } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ questionsFor, flows })', {}, { timeout: 1000 }
);

test('cheque lawyer intake separates party, evidence provenance and procedural chronology', () => {
  const questions = questionsFor('check', 'وکیل');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'دارنده فعلی، صادرکننده یا انتقال‌دهنده', 'مرحله فعلی رسیدگی',
    'صدور مندرج', 'تحویل واقعی', 'انتقال‌های احتمالی',
    'مراجعه به بانک', 'گواهی عدم پرداخت', 'آخرین ابلاغ',
    'حدس نزنید', 'ثبت، تأیید و انتقال در صیاد',
    'منشأ هر ادعا', 'پرداخت یا استرداد جزئی',
    'اقدامات قضایی یا ثبتی موازی', 'اصل اسناد را بدون تغییر'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing lawyer chronology: ' + phrase);
  }
});

test('cheque lawyer intake excludes identifiers and unsupported legal outcomes', () => {
  const prompt = questionsFor('check', 'وکیل').at(-1);
  for (const phrase of [
    'شماره کامل چک، حساب، شناسه صیادی', 'شماره پرونده',
    'اطلاعات هویتی موکل یا اشخاص ثالث', 'رمز و کد تأیید',
    'مهلت قانونی، مرجع صالح، قابلیت اجرای چک',
    'مسئولیت کیفری یا مانده قطعی وجه',
    'بررسی قانون لازم‌الاجرا و تأیید حقوقی انسانی ضروری است'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing lawyer privacy/legal guard: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'شاهد']) {
    assert.doesNotMatch(questionsFor('check', role).at(-1),
      /نقش موکل \(دارنده فعلی، صادرکننده یا انتقال‌دهنده\)/);
  }
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
});
