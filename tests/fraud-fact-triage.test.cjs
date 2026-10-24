'use strict';
// Synthetic fraud-intake contract only. This does not establish criminal intent,
// jurisdiction, applicable law, or the validity of any legal citation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('fraud intake distinguishes channel, representation, payment and evidence', () => {
  const questions = flows.fraud.questions;
  assert.equal(questions.length, 4, 'preserve five-step interview with role question');
  assert.match(questions[0], /حضوری/);
  assert.match(questions[0], /سایت/);
  assert.match(questions[0], /پیام‌رسان/);
  assert.match(questions[1], /ادعا یا وعده/);
  assert.match(questions[1], /تعهد قراردادی/);
  assert.match(questions[2], /تاریخ/);
  assert.match(questions[2], /تحویل/);
  assert.match(questions[3], /رسید تراکنش/);
  assert.match(questions[3], /مرجع قضایی/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('fraud', role).length, 5, role);
  }
});

test('fraud intake discourages secrets and treats legal status as unverified', () => {
  const questions = flows.fraud.questions.join(' ');
  const documents = flows.fraud.docs.join(' ');
  assert.match(questions, /رمز یا اطلاعات ورود ننویسید/);
  assert.match(questions, /اطلاعات کامل کارت و حساب را ننویسید/);
  assert.match(documents, /پوشاندن شماره کامل کارت یا حساب/);
  assert.match(documents, /حذف رمز، کد یکبارمصرف/);
  assert.equal(Object.hasOwn(flows.fraud, 'source'), false);
  assert.equal(Object.hasOwn(flows.fraud, 'criminalClassification'), false);
});
