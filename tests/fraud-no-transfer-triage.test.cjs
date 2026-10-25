'use strict';
// Synthetic intake only: no assumption of a completed transfer or criminal offense.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  code + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('fraud intake accepts an alleged payment request without a transfer', () => {
  const questions = flows.fraud.questions;
  assert.equal(questions.length, 4, 'preserve four common prompts');
  assert.match(questions[2], /اگر هیچ وجه یا مالی منتقل نشده/);
  assert.match(questions[2], /درخواست پرداخت یا تلاش برای دریافت مال/);
  assert.match(questions[2], /آیا تمام یا بخشی از وجه مسترد شده/);
  assert.match(questions[2], /اطلاعات کامل کارت و حساب را ننویسید/);
  assert.match(flows.fraud.docs.join(' '), /پیام درخواست پرداخت در صورت عدم انتقال/);
  assert.match(flows.fraud.docs.join(' '), /پوشاندن شماره کامل کارت یا حساب/);
  assert.match(questions[1], /تعهد قراردادی/);
  assert.equal(Object.hasOwn(flows.fraud, 'source'), false);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('fraud', role).length, 5, role);
  }
});
