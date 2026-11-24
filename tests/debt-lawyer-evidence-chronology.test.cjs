'use strict';
// Synthetic-only non-cheque debt lawyer intake contract; not legal advice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { questionsFor, flows } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ questionsFor, flows })', {}, { timeout: 1000 }
);

test('debt lawyer intake records chronology, defenses and provenance separately', () => {
  const questions = questionsFor('debt', 'وکیل');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'طلبکار یا بدهکار', 'مرحله فعلی رسیدگی', 'ایجاد تعهد',
    'سررسید', 'مطالبه قبلی', 'آخرین ابلاغ', 'حدس نزنید',
    'راستی‌آزمایی', 'تهاتر یا ابراء', 'منشأ دلیل',
    'اصل قرارداد', 'اظهارنامه', 'مشاهده مستقیم شاهد',
    'پرداخت‌های جزئی', 'تمدید مهلت', 'تعهد متقابل',
    'اجرای موازی', 'اصل اسناد را بدون تغییر'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing debt lawyer triage: ' + phrase);
  }
});

test('debt lawyer intake excludes identifiers and does not decide legal outcomes', () => {
  const prompt = questionsFor('debt', 'وکیل').at(-1);
  for (const phrase of [
    'شماره کامل حساب یا کارت', 'کد ملی', 'شماره پرونده',
    'رمز، کد تأیید', 'اطلاعات محرمانه موکل یا اشخاص ثالث',
    'مانده قطعی دین', 'خسارت تأخیر', 'مرجع صالح',
    'مهلت قانونی یا قابلیت اجرا',
    'بررسی قانون لازم‌الاجرا و تأیید حقوقی انسانی ضروری است'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing privacy/legal guard: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'شاهد']) {
    assert.doesNotMatch(questionsFor('debt', role).at(-1), /نقش موکل \(طلبکار یا بدهکار\)/);
  }
  assert.equal(Object.hasOwn(flows.debt, 'source'), false);
});
