'use strict';
// Synthetic-only lawyer intake contract. Not a determination of family-law rights.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('divorce lawyer records petition path, chronology and evidence provenance', () => {
  const questions = questionsFor('divorce', 'وکیل');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'نقش موکل', 'زوج یا زوجه', 'توافقی', 'آخرین ابلاغ',
    'تاریخ نامعلوم را حدس نزنید', 'شروط عقد', 'وکالت در طلاق',
    'منشأ هر دلیل', 'اصل سند ازدواج', 'ابلاغیه', 'رأی',
    'مشاهده مستقیم شاهد', 'شنیده‌های دیگران',
    'مهریه', 'نفقه', 'اجرت‌المثل', 'جهیزیه',
    'پرداخت، بذل یا توافق', 'اصل مدارک را بدون تغییر'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing divorce lawyer intake: ' + phrase);
  }
});

test('divorce lawyer protects children and refuses unreviewed legal outcomes', () => {
  const prompt = questionsFor('divorce', 'وکیل').at(-1);
  for (const phrase of [
    'فقط تعداد و رده سنی', 'حضانت', 'ملاقات', 'نام، نشانی، مدرسه',
    'اطلاعات پزشکی یا هویتی کودک', 'شماره پرونده', 'کد ملی',
    'شماره کامل حساب یا کارت', 'رمز، کد تأیید', 'اشخاص ثالث',
    'خطر فوری', 'مبنای قانونی طلاق', 'مرجع صالح',
    'مهلت اعتراض', 'تأیید حقوقی انسانی ضروری است'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing divorce privacy/review safeguard: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'شاهد']) {
    assert.doesNotMatch(questionsFor('divorce', role).at(-1), /منشأ هر دلیل/);
  }
  assert.equal(Object.hasOwn(flows.divorce, 'source'), false);
  assert.equal(Object.hasOwn(flows.divorce, 'jurisdiction'), false);
});
