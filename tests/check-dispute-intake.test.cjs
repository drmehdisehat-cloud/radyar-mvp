'use strict';
// Synthetic-only regression for lost/stolen cheques, disputed signatures,
// and stop-payment allegations. Intake prompts are not legal determinations.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cheque intake asks about loss, theft, forgery and stop-payment separately', () => {
  const q = flows.check.questions;
  assert.equal(q.length, 4, 'preserve four common questions');
  for (const term of ['مفقودی', 'سرقت چک', 'جعل امضا', 'دستور عدم پرداخت']) {
    assert.ok(q[3].includes(term), 'missing cheque dispute fact: ' + term);
  }
  assert.match(q[3], /تاریخ تقریبی، نوع مدرک و مرجع اقدام/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('check', role).length, 5, role);
  }
});

test('cheque dispute intake does not solicit identifiers or infer legal status', () => {
  const q = flows.check.questions[3];
  assert.match(q, /بدون شماره حساب، شناسه صیادی یا اطلاعات اشخاص/);
  assert.match(q, /وضعیت حقوقی یا کیفری چک را تعیین نمی‌کند/);
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
  assert.equal(Object.hasOwn(flows.check, 'legalStatus'), false);
  assert.equal(Object.hasOwn(flows.check, 'enforcementEligibility'), false);
});
