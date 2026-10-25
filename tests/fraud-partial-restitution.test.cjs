'use strict';
// Synthetic intake regression: factual accounting only, not a legal conclusion.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  code + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('fraud interview asks about refunds, partial delivery and remaining dispute', () => {
  assert.equal(flows.fraud.questions.length, 4);
  const payment = flows.fraud.questions[2];
  assert.match(payment, /تمام یا بخشی از وجه مسترد شده/);
  assert.match(payment, /تحویل جزئی/);
  assert.match(payment, /مبلغ باقی‌مانده/);
  assert.match(payment, /تاریخ تقریبی هر استرداد یا تحویل/);
  assert.match(payment, /بدون مشخصات بانکی محرمانه/);
  assert.match(payment, /اطلاعات کامل کارت و حساب را ننویسید/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('fraud', role).length, 5);
  }
  assert.equal(Object.hasOwn(flows.fraud, 'source'), false);
});
