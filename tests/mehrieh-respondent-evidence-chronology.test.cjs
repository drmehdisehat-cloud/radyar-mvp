'use strict';
// Synthetic-only interview regression. No real case data or legal conclusions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('mehrieh respondent distinguishes civil role, chronology, estate and evidence', () => {
  const questions = questionsFor('mehrieh', 'خوانده / متهم');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'زوج، قائم‌مقام قانونی', 'متهم کیفری نیست',
    'سکه، وجه رایج یا مال معین', 'مقدار و واحد مندرج',
    'تاریخ تقریبی عقد', 'هر پرداخت یا تحویل مال',
    'بذل', 'ابراء', 'آخرین ابلاغ', 'تاریخ را نمی‌دانید حدس نزنید',
    'سال تقریبی فوت', 'مطالبه از ترکه',
    'اعسار یا تقسیط', 'اقدامات موازی در ثبت و دادگاه',
    'اصل عقدنامه', 'ابلاغیه یا رأی',
    'شنیده‌های دیگران را از مشاهده مستقیم'
  ]) assert.ok(prompt.includes(phrase), 'missing respondent intake: ' + phrase);
});

test('mehrieh respondent keeps identifiers private and legal outcomes unverified', () => {
  const prompt = questionsFor('mehrieh', 'خوانده / متهم').at(-1);
  for (const phrase of [
    'اطلاعات هویتی ورثه', 'شماره پرونده', 'شماره سند', 'کد ملی',
    'شماره کامل حساب یا کارت', 'رمز', 'کد تأیید', 'اشخاص ثالث',
    'مانده قطعی مهریه', 'محاسبه وجه رایج', 'آثار فوت',
    'مرجع صالح', 'امکان اجرا', 'مسئولیت کیفری',
    'قانون لازم‌الاجرا', 'تأیید حقوقی انسانی ضروری است'
  ]) assert.ok(prompt.includes(phrase), 'missing safeguard: ' + phrase);
  for (const role of ['خواهان / شاکی', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('mehrieh', role).length, 5);
    assert.doesNotMatch(questionsFor('mehrieh', role).at(-1), /عنوان «خوانده»/);
  }
  assert.equal(Object.hasOwn(flows.mehrieh, 'source'), false);
  assert.equal(Object.hasOwn(flows.mehrieh, 'jurisdiction'), false);
  assert.equal(Object.hasOwn(flows.mehrieh, 'calculatedAmount'), false);
});
