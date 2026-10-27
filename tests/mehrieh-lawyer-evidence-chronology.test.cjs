'use strict';
// Synthetic-only lawyer interview contract; no client data or legal conclusions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('mehrieh lawyer separates obligation, chronology, estate and evidence sources', () => {
  const questions = questionsFor('mehrieh', 'وکیل');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'نقش موکل', 'زوجه، زوج', 'مرحله فعلی رسیدگی',
    'سکه، وجه رایج، مال معین یا ترکیبی',
    'اصل عقدنامه', 'عندالمطالبه یا عندالاستطاعه',
    'تاریخ تقریبی عقد', 'هر پرداخت', 'آخرین ابلاغ',
    'تاریخ نامعلوم را حدس نزنید', 'سال تقریبی فوت',
    'مطالبه از ترکه', 'سال عقد، سال فوت و سال پرداخت',
    'پرداخت‌های جزئی', 'بذل', 'ابراء', 'توافق ارزش‌گذاری',
    'اعسار یا تقسیط', 'اقدامات موازی ثبت یا دادگاه',
    'منشأ هر دلیل', 'ابلاغیه', 'رأی', 'مشاهده مستقیم شاهد',
    'شنیده‌های دیگران', 'اصل مدارک را بدون تغییر'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing lawyer chronology/provenance: ' + phrase);
  }
});

test('mehrieh lawyer minimizes identifiers and blocks unreviewed outcomes', () => {
  const prompt = questionsFor('mehrieh', 'وکیل').at(-1);
  for (const phrase of [
    'شماره سند ازدواج', 'شماره پرونده', 'کد ملی',
    'نام و نشانی ورثه', 'شماره کامل حساب یا کارت',
    'امضا', 'رمز، کد تأیید', 'اشخاص ثالث',
    'شاخص بانک مرکزی', 'محاسبه وجه رایج',
    'مانده قطعی مهریه', 'آثار فوت و ترکه',
    'مرجع صالح', 'مهلت قانونی', 'امکان بازداشت',
    'اصلاحات و تاریخ اعتبار آن', 'تأیید حقوقی انسانی ضروری است'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing privacy/legal guard: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'شاهد']) {
    assert.doesNotMatch(questionsFor('mehrieh', role).at(-1), /نقش موکل \(زوجه، زوج/);
  }
  assert.equal(Object.hasOwn(flows.mehrieh, 'source'), false);
  assert.equal(Object.hasOwn(flows.mehrieh, 'jurisdiction'), false);
  assert.equal(Object.hasOwn(flows.mehrieh, 'calculatedAmount'), false);
});
