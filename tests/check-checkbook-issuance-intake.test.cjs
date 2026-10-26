'use strict';
// Synthetic-only intake regression. The bank's checkbook delivery period is
// distinct from the issue date written on a cheque. This does not determine
// Sayad registration obligations or civil/criminal enforcement eligibility.
// Research lead (not a reviewed legal citation):
// https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cheque intake separates bank checkbook provision date from cheque issue date', () => {
  const q = flows.check.questions;
  assert.equal(q.length, 4);
  assert.match(q[0], /تاریخ صدور مندرج در چک/);
  assert.match(q[1], /دسته‌چک مربوط را بانک چه زمانی/);
  assert.match(q[1], /پیش از پایان اسفند ۱۳۹۹، پس از آن یا نامشخص/);
  assert.match(q[1], /تاریخ ارائه دسته‌چک را با تاریخ صدور خود چک اشتباه نگیرید/);
  assert.match(q[1], /ثبت صدور، تأیید دریافت و انتقال/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('check', role).length, 5);
  }
});

test('checkbook period does not assert legal eligibility or source verification', () => {
  assert.match(flows.check.questions[1], /اگر مطمئن نیستید «نامشخص» بنویسید/);
  assert.match(flows.check.questions[1], /صرف نوع چک، مسیر حقوقی یا قابلیت اجرا را تعیین نمی‌کند/);
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
  assert.equal(Object.hasOwn(flows.check, 'enforcementEligibility'), false);
  assert.equal(Object.hasOwn(flows.check, 'legalStatus'), false);
});
