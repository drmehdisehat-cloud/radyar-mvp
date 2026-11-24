'use strict';
// Synthetic-only regression: instrument type is a factual question,
// not a legal eligibility decision or a verified statutory citation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cheque intake distinguishes instrument types without changing question count', () => {
  const q = flows.check.questions;
  assert.equal(q.length, 4, 'retain four topic prompts');
  for (const label of ['عادی کاغذی', 'الکترونیکی', 'تضمین‌شده', 'نامشخص']) {
    assert.ok(q[1].includes(label), label);
  }
  assert.match(q[1], /ثبت صدور، تأیید دریافت و انتقال/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('check', role).length, 5, role);
  }
});

test('instrument classification does not assert enforceability or legal source review', () => {
  assert.match(flows.check.questions[1], /صرف نوع چک، مسیر حقوقی یا قابلیت اجرا را تعیین نمی‌کند/);
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
  assert.equal(Object.hasOwn(flows.check, 'enforcementEligibility'), false);
});
