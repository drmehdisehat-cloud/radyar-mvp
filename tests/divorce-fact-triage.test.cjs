'use strict';
// Synthetic-only divorce intake regression tests; no case facts or legal conclusions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('divorce intake distinguishes petition basis, children, finances and procedural stage', () => {
  const q = flows.divorce.questions;
  assert.equal(q.length, 4);
  assert.match(q[0], /زوج، زوجه یا به‌صورت توافقی/);
  assert.match(q[0], /وکالت در طلاق/);
  assert.match(q[1], /حضانت/);
  assert.match(q[1], /ملاقات/);
  assert.match(q[2], /اجرت‌المثل/);
  assert.match(q[2], /جهیزیه/);
  assert.match(q[3], /آخرین مرحله رسیدگی/);
  assert.match(q[3], /خطر فوری/);
});

test('divorce evidence instructions protect minors and sensitive identity data', () => {
  const q = flows.divorce.questions.join(' ');
  const docs = flows.divorce.docs.join(' ');
  assert.match(q, /نام، کد ملی یا نشانی کودک را ننویسید/);
  assert.match(q, /اطلاعات کامل بانکی ننویسید/);
  assert.match(docs, /پوشاندن کد ملی/);
  assert.match(docs, /پوشاندن نام، نشانی، اطلاعات هویتی و پزشکی کودکان/);
  assert.equal(Object.hasOwn(flows.divorce, 'jurisdiction'), false);
  assert.equal(Object.hasOwn(flows.divorce, 'source'), false);
});

test('divorce role questions distinguish claimant, respondent, lawyer and direct witness', () => {
  const roles = ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد'];
  for (const role of roles) assert.equal(questionsFor('divorce', role).length, 5);
  assert.match(questionsFor('divorce', roles[0])[4], /مبنای درخواست/);
  assert.match(questionsFor('divorce', roles[1])[4], /چه پاسخ و مدرکی/);
  assert.match(questionsFor('divorce', roles[2])[4], /شروط عقد/);
  assert.match(questionsFor('divorce', roles[3])[4], /شخصاً مشاهده/);
});
