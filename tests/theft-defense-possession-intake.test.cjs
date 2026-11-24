'use strict';
// Synthetic-only: defense-side intake must not force admissions or infer criminal guilt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('theft accused intake asks about lawful-possession context without compelled admission', () => {
  const questions = questionsFor('theft', 'خوانده / متهم');
  assert.equal(questions.length, 5);
  const prompt = questions.at(-1);
  assert.match(prompt, /اتهام به شما ابلاغ شده/);
  assert.match(prompt, /منشأ تصرف مال/);
  assert.match(prompt, /تحویل با رضایت، امانت، اجاره، خرید یا تصرف بدون اجازه/);
  assert.match(prompt, /زمان تقریبی تحویل، حدود اجازه، درخواست استرداد/);
  assert.match(prompt, /نیازی به پذیرش یا رد اتهام/);
  assert.match(prompt, /مشورت وکیل/);
});

test('defense intake does not demand identifying data or decide guilt', () => {
  const accused = questionsFor('theft', 'خوانده / متهم').at(-1);
  assert.match(accused, /نام اشخاص، نشانی، شماره حساب، شماره سریال یا شناسه مال را وارد نکنید/);
  assert.match(accused, /عنوان مجرمانه یا مسئولیت قطعی را تعیین نمی‌کنند/);
  const claimant = questionsFor('theft', 'خواهان / شاکی').at(-1);
  assert.doesNotMatch(claimant, /نیازی به پذیرش یا رد اتهام/);
  assert.equal(Object.hasOwn(flows.theft, 'source'), false);
  assert.equal(Object.hasOwn(flows.theft, 'legalStatus'), false);
});
