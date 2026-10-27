'use strict';
// Synthetic-only intake: distinguish alleged initial representations, delivery,
// refunds and unauthorized transfers without prejudging fraud or collecting PII.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ questionsFor })', {}, { timeout: 1000 }
);

test('fraud accused intake separates initial representations, receipt and performance', () => {
  const questions = questionsFor('fraud', 'خوانده / متهم');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'موضوع اتهام', 'در زمان توافق', 'چه وعده یا توضیحی',
    'چه مال یا وجهی واقعاً دریافت شده', 'چه تعهدی انجام یا تحویل شده',
    'اختلاف قراردادی', 'تاریخ تقریبی', 'استرداد جزئی یا کامل',
    'دسترسی غیرمجاز'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing factual distinction: ' + phrase);
  }
});

test('fraud accused intake protects identifiers and avoids guilt determination', () => {
  const prompt = questionsFor('fraud', 'خوانده / متهم').at(-1);
  for (const phrase of ['بدون شماره حساب، کارت، رمز، کد تأیید',
    'مشخصات اشخاص', 'به‌تنهایی وقوع جرم یا مسئولیت کیفری را اثبات نمی‌کنند',
    'مشورت وکیل']) {
    assert.ok(prompt.includes(phrase), 'missing safeguard: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'شاهد', 'وکیل']) {
    assert.doesNotMatch(questionsFor('fraud', role).at(-1), /موضوع اتهام یا ادعای طرف مقابل دقیقاً چیست/);
  }
});
