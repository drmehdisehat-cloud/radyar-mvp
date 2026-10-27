'use strict';
// Synthetic-only divorce respondent intake checks. No personal data or legal findings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('divorce respondent distinguishes civil role, petition path, chronology and evidence', () => {
  const questions = questionsFor('divorce', 'خوانده / متهم');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'زوج یا زوجه', 'زوج، زوجه یا توافقی', 'متهم کیفری نیست',
    'چه پاسخ و مدرکی', 'ثبت دادخواست', 'آخرین ابلاغ',
    'جلسه رسیدگی', 'تصمیم قبلی', 'اعتراض احتمالی',
    'تاریخ نامعلوم را حدس نزنید', 'شروط ضمن عقد', 'وکالت در طلاق',
    'مهریه', 'نفقه', 'اجرت‌المثل', 'جهیزیه',
    'پرداخت یا توافق', 'اصل سند ازدواج', 'ابلاغیه و رأی',
    'مشاهده مستقیم را از شنیده‌های دیگران'
  ]) assert.ok(prompt.includes(phrase), 'missing respondent evidence triage: ' + phrase);
});

test('divorce respondent protects children and blocks unreviewed legal outcomes', () => {
  const prompt = questionsFor('divorce', 'خوانده / متهم').at(-1);
  for (const phrase of [
    'فقط تعداد و رده سنی', 'حضانت', 'ملاقات',
    'نام، مدرسه، نشانی و اطلاعات پزشکی یا هویتی کودک',
    'شماره پرونده', 'کد ملی', 'شماره کامل حساب یا کارت',
    'رمز، کد تأیید', 'اشخاص ثالث', 'خطر فوری',
    'بدون جزئیات شناسایی‌کننده', 'مبنای قانونی طلاق',
    'مرجع صالح', 'مهلت اعتراض', 'تأیید حقوقی انسانی ضروری است'
  ]) assert.ok(prompt.includes(phrase), 'missing privacy or legal-review guard: ' + phrase);
  for (const role of ['خواهان / شاکی', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('divorce', role).length, 5);
    assert.doesNotMatch(questionsFor('divorce', role).at(-1), /عنوان «خوانده»/);
  }
  assert.equal(Object.hasOwn(flows.divorce, 'source'), false);
  assert.equal(Object.hasOwn(flows.divorce, 'jurisdiction'), false);
});
