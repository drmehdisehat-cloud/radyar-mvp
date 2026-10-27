'use strict';
// Synthetic-only cheque respondent intake regression. No client data or legal advice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cheque respondent distinguishes role, temporal events and contested evidence', () => {
  const questions = questionsFor('check', 'خوانده / متهم');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'صادرکننده، انتقال‌دهنده، ضامن', 'احراز مسئولیت کیفری نیست',
    'صدور مندرج', 'تحویل واقعی', 'سررسید', 'انتقال احتمالی',
    'مراجعه دارنده به بانک', 'گواهی عدم پرداخت', 'آخرین ابلاغ',
    'تاریخ نامعلوم را حدس نزنید', 'دسته‌چک چه زمانی',
    'ثبت صدور، تأیید دریافت یا انتقال', 'تضمینی، امانی، مشروط',
    'سفیدامضا یا وعده‌دار', 'اصالت امضا', 'دستور عدم پرداخت',
    'پرداخت کامل یا جزئی', 'اقدام قضایی و ثبتی موازی',
    'مبلغ، واحد پول، تاریخ تقریبی', 'منشأ هر ادعا',
    'مشاهده مستقیم یا صرفاً شنیده‌های دیگران', 'اصل اسناد را بدون تغییر'
  ]) assert.ok(prompt.includes(phrase), 'missing cheque respondent triage: ' + phrase);
});

test('cheque respondent prevents sensitive identifiers and premature legal conclusions', () => {
  const prompt = questionsFor('check', 'خوانده / متهم').at(-1);
  for (const phrase of [
    'شماره کامل چک، حساب، شناسه صیادی', 'کد ملی', 'شماره پرونده',
    'امضا', 'نام و نشانی اشخاص ثالث', 'رمز یا کد تأیید',
    'اصالت چک، قابلیت اجرا', 'مانده قطعی وجه', 'مسئولیت کیفری',
    'مرجع صالح یا مهلت قانونی', 'اصلاحات و تاریخ اعتبار',
    'تأیید حقوقی انسانی ضروری است'
  ]) assert.ok(prompt.includes(phrase), 'missing respondent safeguard: ' + phrase);
  for (const role of ['خواهان / شاکی', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('check', role).length, 5);
    assert.doesNotMatch(questionsFor('check', role).at(-1),
      /عنوان «خوانده \/ متهم» در این فرم/);
  }
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
  assert.equal(Object.hasOwn(flows.check, 'jurisdiction'), false);
  assert.equal(Object.hasOwn(flows.check, 'criminalEligibility'), false);
});
