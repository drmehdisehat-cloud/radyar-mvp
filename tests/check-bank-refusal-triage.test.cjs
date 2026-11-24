'use strict';
// Synthetic-only regression: intake collects bank-documented facts without
// asserting a civil, criminal, registration or enforcement conclusion.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cheque intake records actual bank refusal reason and partial vs full nonpayment', () => {
  const q = flows.check.questions;
  assert.equal(q.length, 4, 'retain four shared prompts');
  assert.match(q[2], /گواهی عدم پرداخت/);
  assert.match(q[2], /کد رهگیری/);
  assert.match(q[2], /علت مندرج در گواهی عدم پرداخت/);
  assert.match(q[2], /کسری موجودی/);
  assert.match(q[2], /مغایرت امضا/);
  assert.match(q[2], /تمام مبلغ یا بخشی از آن/);
  assert.match(q[2], /علت را حدس نزنید/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('check', role).length, 5, role);
  }
});

test('cheque bank-refusal question does not collect full identifiers or decide eligibility', () => {
  const q = flows.check.questions[2];
  assert.match(q, /بدون درج اطلاعات محرمانه/);
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
  assert.equal(Object.hasOwn(flows.check, 'legalStatus'), false);
  assert.equal(Object.hasOwn(flows.check, 'enforcementEligibility'), false);
});
