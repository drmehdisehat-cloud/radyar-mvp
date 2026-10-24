'use strict';
// Synthetic-only mehrieh intake regression. No jurisdiction, detention,
// enforcement eligibility or legal source validity is inferred here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('mehrieh intake distinguishes obligation, discharge, enforcement and evidence', () => {
  const q = flows.mehrieh.questions;
  assert.equal(q.length, 4);
  assert.match(q[0], /سکه، وجه نقد، مال معین/);
  assert.match(q[0], /عندالمطالبه\/عندالاستطاعه/);
  assert.match(q[1], /پرداخت، منتقل، بذل یا ابراء/);
  assert.match(q[2], /ثبت یا دادگاه/);
  assert.match(q[2], /اعسار و تقسیط/);
  assert.match(q[3], /رأی اعسار یا تقسیط/);
});

test('mehrieh prompts minimize identity, banking and third-party disclosures', () => {
  const q = flows.mehrieh.questions.join(' ');
  const docs = flows.mehrieh.docs.join(' ');
  assert.match(q, /شماره سند یا اطلاعات هویتی کامل ننویسید/);
  assert.match(q, /اطلاعات حساب، کارت یا مشخصات اشخاص ثالث را ننویسید/);
  assert.match(docs, /پوشاندن کد ملی/);
  assert.match(docs, /پوشاندن شماره کامل حساب و کارت/);
  assert.equal(Object.hasOwn(flows.mehrieh, 'jurisdiction'), false);
  assert.equal(Object.hasOwn(flows.mehrieh, 'source'), false);
  assert.equal(Object.hasOwn(flows.mehrieh, 'enforcementEligibility'), false);
});

test('mehrieh role-specific questions preserve direct witness and defense paths', () => {
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('mehrieh', role).length, 5);
  }
  assert.match(questionsFor('mehrieh', 'خواهان / شاکی')[4], /پس از کسر موارد وصول‌شده/);
  assert.match(questionsFor('mehrieh', 'خوانده / متهم')[4], /اعسار یا تقسیط/);
  assert.match(questionsFor('mehrieh', 'وکیل')[4], /مفاد عقدنامه/);
  assert.match(questionsFor('mehrieh', 'شاهد')[4], /شخصاً مشاهده/);
});
