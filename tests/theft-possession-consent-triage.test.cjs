'use strict';
// Synthetic-only regression: intake must distinguish consent and entrustment
// from alleged unauthorized taking without deciding the criminal classification.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('theft interview asks whether possession began with consent or entrustment', () => {
  const question = flows.theft.questions[2];
  assert.match(question, /با رضایت مالک/);
  assert.match(question, /برای نگهداری، اجاره یا استفاده/);
  assert.match(question, /بدون رضایت از تصرف خارج شده/);
  assert.match(question, /زمان تقریبی تحویل، درخواست بازگرداندن و وضعیت اجازه/);
  assert.match(question, /«نامشخص»/);
  assert.equal(flows.theft.questions.length, 4);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('theft', role).length, 5);
  }
});

test('theft consent triage avoids identifiers and unsupported criminal findings', () => {
  const question = flows.theft.questions[2];
  assert.match(question, /بدون نام و شناسه اشخاص/);
  assert.match(question, /عنوان کیفری یا مالکیت قطعی را تعیین نمی‌کند/);
  assert.equal(Object.hasOwn(flows.theft, 'source'), false);
  assert.equal(Object.hasOwn(flows.theft, 'legalStatus'), false);
});
