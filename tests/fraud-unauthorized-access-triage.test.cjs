'use strict';
// Synthetic contract only: distinguish a voluntary transfer from an
// unauthorized debit/access without automatically assigning a criminal charge.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  code + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('fraud intake distinguishes authorized payment from unauthorized access', () => {
  const questions = flows.fraud.questions;
  assert.equal(questions.length, 4);
  assert.match(questions[2], /انتقال را خودتان آگاهانه تأیید کردید/);
  assert.match(questions[2], /برداشت بدون اجازه/);
  assert.match(questions[2], /دسترسی غیرمجاز/);
  assert.match(questions[2], /حساب یا کیف پول/);
  assert.match(questions[2], /نه رمز یا کد تأیید/);
  assert.match(questions[3], /مسیر رسمی بانک یا پلتفرم/);
  assert.match(questions[3], /ایمن‌سازی دسترسی و ثبت گزارش/);
  assert.doesNotMatch(questions.join(' '), /قطعاً کلاهبرداری|مجرم قطعی/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('fraud', role).length, 5, role);
  }
  assert.equal(Object.hasOwn(flows.fraud, 'source'), false,
    'new intake detail must not invent a verified legal source');
});
