'use strict';
// Synthetic-only witness intake. This checks prompt boundaries, not evidence
// admissibility, legal classification, or the credibility of any real witness.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('fraud witness separates direct knowledge, hearsay and later document review', () => {
  const questions = questionsFor('fraud', 'شاهد');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  for (const phrase of [
    'شخصاً دیده یا شنیده‌اید', 'فقط از دیگران نقل می‌کنید',
    'زمان تقریبی', 'روش ارتباط', 'اگر فقط بعداً پیام، رسید یا تصویر را دیده‌اید',
    'مشاهده مستقیم واقعه جدا کنید', 'اصل فایل را بدون تغییر نگه دارید'
  ]) {
    assert.ok(prompt.includes(phrase), 'missing witness boundary: ' + phrase);
  }
});

test('fraud witness prompt protects third parties and does not decide guilt', () => {
  const witness = questionsFor('fraud', 'شاهد').at(-1);
  for (const phrase of [
    'نام، شماره تماس، شناسه حساب، رمز، کد تأیید، نشانی دقیق',
    'اطلاعات هویتی اشخاص را ننویسید',
    'به‌تنهایی وقوع جرم، اعتبار شهادت یا مسئولیت شخصی را ثابت نمی‌کند'
  ]) {
    assert.ok(witness.includes(phrase), 'missing privacy or legal caveat: ' + phrase);
  }
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل']) {
    assert.doesNotMatch(questionsFor('fraud', role).at(-1),
      /اگر فقط بعداً پیام، رسید یا تصویر را دیده‌اید/);
  }
  assert.equal(Object.hasOwn(flows.fraud, 'source'), false);
});
