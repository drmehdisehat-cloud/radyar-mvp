'use strict';
// Synthetic-only cheque intake regression. These facts do not establish
// legal deadlines, enforceability or an automatically calculated balance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cheque intake asks for partial payment and proceeding chronology', () => {
  const prompt = flows.check.questions[3];
  assert.match(prompt, /پرداخت یا تسویه جزئی/);
  assert.match(prompt, /مبلغ و واحد پول، تاریخ تقریبی و نوع مدرک/);
  assert.match(prompt, /تاریخ تقریبی ثبت اقدام، آخرین ابلاغ و مرحله رسیدگی/);
  assert.match(prompt, /بدون شماره پرونده/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('check', role).length, 5, role);
  }
});

test('cheque chronology warns against PII and unsupported legal conclusions', () => {
  const prompt = flows.check.questions[3];
  assert.match(prompt, /شماره حساب، کارت یا مشخصات پرداخت‌کننده را وارد نکنید/);
  assert.match(prompt, /هیچ مهلت قانونی یا مانده قطعی وجه/);
  assert.match(prompt, /صرف این پاسخ‌ها وضعیت حقوقی یا کیفری چک را تعیین نمی‌کند/);
  assert.equal(Object.hasOwn(flows.check, 'source'), false);
  assert.equal(Object.hasOwn(flows.check, 'legalStatus'), false);
  assert.equal(Object.hasOwn(flows.check, 'enforcementEligibility'), false);
});
