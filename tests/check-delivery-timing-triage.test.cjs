'use strict';
// Synthetic-only regression for cheque timing and delivery intake.
// These prompts do not determine criminal liability or enforcement eligibility.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cheque interview distinguishes written issue date from actual handover', () => {
  const questions = flows.check.questions;
  assert.equal(questions.length, 4, 'keep five-question role-specific interview');
  assert.match(questions[0], /تاریخ صدور مندرج در چک/);
  assert.match(questions[0], /تاریخ سررسید/);
  assert.match(questions[0], /تاریخ تقریبی تحویل واقعی/);
  assert.match(questions[0], /تفاوت/);
  assert.match(questions[3], /سفیدامضا/);
  assert.match(questions[3], /مشروط/);
  assert.match(questions[3], /وعده‌دار/);
  assert.match(questions[3], /شرایط تحویل/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('check', role).length, 5, role);
  }
});

test('cheque interview protects identifiers and does not decide legal outcomes', () => {
  const questions = flows.check.questions.join(' ');
  assert.match(questions, /شماره کامل چک، حساب یا شناسه صیادی را ننویسید/);
  assert.match(questions, /صرف این پاسخ‌ها وضعیت حقوقی یا کیفری چک را تعیین نمی‌کند/);
  assert.equal(Object.hasOwn(flows.check, 'legalStatus'), false);
  assert.equal(Object.hasOwn(flows.check, 'enforcementEligibility'), false);
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
});
