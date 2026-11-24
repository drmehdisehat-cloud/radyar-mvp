'use strict';
// Synthetic intake regression only: this is not verification of cheque law,
// Sayad registration, venue, limitation periods or enforcement eligibility.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cheque intake covers issue, due date, Sayad lifecycle and bank response', () => {
  const questions = flows.check.questions;
  assert.equal(questions.length, 4, 'preserve four common and one role-specific question');
  assert.match(questions[0], /تاریخ صدور/);
  assert.match(questions[0], /تاریخ سررسید/);
  assert.match(questions[0], /مبلغ/);
  assert.match(questions[1], /صیادی/);
  assert.match(questions[1], /ثبت صدور/);
  assert.match(questions[1], /تأیید دریافت/);
  assert.match(questions[1], /انتقال/);
  assert.match(questions[2], /گواهی عدم پرداخت/);
  assert.match(questions[2], /کد رهگیری/);
  assert.match(questions[3], /تضمین یا امانت/);
  assert.match(questions[3], /پرداخت جزئی/);
  assert.match(questions[3], /قضایی\/ثبتی/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('check', role).length, 5, role);
  }
});

test('cheque intake requests redaction and avoids unreviewed legal conclusions', () => {
  const questions = flows.check.questions.join(' ');
  const docs = flows.check.docs.join(' ');
  assert.match(questions, /شماره کامل چک، حساب یا شناسه صیادی را ننویسید/);
  assert.match(questions, /«نامشخص»/);
  assert.match(docs, /پوشاندن شماره حساب/);
  assert.match(docs, /رمز و کد تأیید ارسال نشود/);
  assert.match(docs, /ابلاغیه‌های قضایی یا ثبتی/);
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
  assert.equal(Object.hasOwn(flows.check, 'enforcementEligibility'), false);
  assert.equal(Object.hasOwn(flows.check, 'legalStatus'), false);
});

test('cheque role-specific questions distinguish claimant, respondent and witness', () => {
  assert.match(questionsFor('check', 'خواهان / شاکی')[4], /دارنده فعلی/);
  assert.match(questionsFor('check', 'خوانده / متهم')[4], /تضمینی یا امانی/);
  assert.match(questionsFor('check', 'وکیل')[4], /گواهی عدم پرداخت/);
  assert.match(questionsFor('check', 'شاهد')[4], /شخصاً مشاهده/);
});
