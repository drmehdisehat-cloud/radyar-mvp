'use strict';
// Synthetic non-cheque debt intake checks only. No legal outcome, venue,
// limitation period, enforceability or statutory accuracy is certified.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('non-cheque debt intake captures obligation, due date, defenses and proof', () => {
  const questions = flows.debt.questions;
  assert.equal(questions.length, 4, 'preserve four common plus one role-specific question');
  assert.match(questions[0], /قرض/);
  assert.match(questions[0], /قرارداد/);
  assert.match(questions[0], /اصل قرارداد/);
  assert.match(questions[1], /مبلغ اصل طلب/);
  assert.match(questions[1], /سررسید/);
  assert.match(questions[1], /زمان مطالبه/);
  assert.match(questions[2], /پرداخت کامل یا جزئی/);
  assert.match(questions[2], /تهاتر/);
  assert.match(questions[2], /ابراء/);
  assert.match(questions[3], /اظهارنامه/);
  assert.match(questions[3], /دعوا یا اجرای دیگری/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('debt', role).length, 5, role);
  }
});

test('debt evidence guidance requests redaction and does not invent legal conclusions', () => {
  const questions = flows.debt.questions.join(' ');
  const docs = flows.debt.docs.join(' ');
  assert.match(questions, /شماره کامل حساب یا کارت ننویسید/);
  assert.match(docs, /پوشاندن شماره کامل حساب و کارت/);
  assert.match(docs, /رمز و کد تأیید/);
  assert.match(docs, /اطلاعات هویتی غیرضروری/);
  assert.equal(Object.hasOwn(flows.debt, 'source'), false);
  assert.equal(Object.hasOwn(flows.debt, 'jurisdiction'), false);
  assert.equal(Object.hasOwn(flows.debt, 'enforcementEligibility'), false);
});

test('debt role prompts distinguish demand, defenses, review and direct observation', () => {
  assert.match(questionsFor('debt', 'خواهان / شاکی')[4], /پس از کسر پرداخت‌های قبلی/);
  assert.match(questionsFor('debt', 'خوانده / متهم')[4], /تعهد متقابل/);
  assert.match(questionsFor('debt', 'وکیل')[4], /راستی‌آزمایی/);
  assert.match(questionsFor('debt', 'شاهد')[4], /شخصاً مشاهده/);
});
