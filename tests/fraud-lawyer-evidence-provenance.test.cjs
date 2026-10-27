'use strict';
// Synthetic-only contract: evidence provenance and procedural timing, not legal advice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ questionsFor })', {}, { timeout: 1000 }
);

test('fraud lawyer intake distinguishes evidence provenance and procedural chronology', () => {
  const questions = questionsFor('fraud', 'وکیل');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'نقش موکل (شاکی یا متهم)', 'مرحله فعلی پرونده',
    'تاریخ آخرین ابلاغ', 'وعده اولیه', 'استرداد جزئی یا کامل',
    'منشأ دلیل', 'مشاهده مستقیم شاهد', 'اصل مکاتبه یا آگهی',
    'رسید با مشخصات پوشانده‌شده', 'گزارش بانک یا پلتفرم',
    'برداشت بدون اجازه یا دسترسی غیرمجاز', 'زمان ثبت آن‌ها'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing lawyer evidence boundary: ' + phrase);
  }
});

test('fraud lawyer intake avoids PII and premature legal conclusions', () => {
  const prompt = questionsFor('fraud', 'وکیل').at(-1);
  for (const phrase of [
    'بدون شماره پرونده یا مشخصات هویتی اشخاص',
    'رمز، کد تأیید، شماره حساب یا کارت',
    'اطلاعات محرمانه موکل را وارد نکنید',
    'مرجع صالح، مهلت اعتراض یا اثر تغییر قانون',
    'قانون لازم‌الاجرا و تأیید حقوقی انسانی نتیجه قطعی ندهید'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing lawyer safety boundary: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'شاهد']) {
    assert.doesNotMatch(questionsFor('fraud', role).at(-1),
      /نقش موکل \(شاکی یا متهم\)/);
  }
});
