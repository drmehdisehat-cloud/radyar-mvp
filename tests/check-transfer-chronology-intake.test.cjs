'use strict';
// Synthetic regression only. Timeline collection is not a legal eligibility finding.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cheque transfer chronology distinguishes bank presentment and refusal', () => {
  const questions = flows.check.questions;
  assert.equal(questions.length, 4);
  assert.match(questions[0], /تاریخ تقریبی تحویل واقعی چک/);
  assert.match(questions[2], /گواهی عدم پرداخت/);
  assert.match(questions[3], /تاریخ تقریبی انتقال/);
  assert.match(questions[3], /پیش یا پس از مراجعه به بانک/);
  assert.match(questions[3], /گواهی عدم پرداخت \(در صورت وجود\)/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('check', role).length, 5, role);
  }
});

test('cheque transfer intake permits unknown facts and discourages personal identifiers', () => {
  const prompt = flows.check.questions[3];
  assert.match(prompt, /اگر نمی‌دانید «نامشخص» بنویسید/);
  assert.match(prompt, /نام، شناسه و اطلاعات تماس انتقال‌دهنده را وارد نکنید/);
  assert.match(prompt, /صرف این پاسخ‌ها وضعیت حقوقی یا کیفری چک را تعیین نمی‌کند/);
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
  assert.equal(Object.hasOwn(flows.check, 'legalStatus'), false);
  assert.equal(Object.hasOwn(flows.check, 'enforcementEligibility'), false);
});
