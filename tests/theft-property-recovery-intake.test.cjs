'use strict';
// Synthetic-only intake regression. Estimated loss and recovery are facts,
// not a finding of theft, damages, venue, or an enforceable amount.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('theft intake records property inventory, value, ownership and recovery', () => {
  const prompt = flows.theft.questions[2];
  assert.match(prompt, /چه نوع مال یا اموالی و به چه تعداد/);
  assert.match(prompt, /ارزش تقریبی و واحد پول/);
  assert.match(prompt, /مالکیت ادعایی/);
  assert.match(prompt, /تمام یا بخشی از اموال بازگردانده شده/);
  assert.match(prompt, /شکستن قفل یا حرز/);
  assert.match(prompt, /اصل فایل و زمان ثبت آن حفظ شده/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('theft', role).length, 5, role);
  }
});

test('theft property triage avoids identifying details and unsupported legal outcomes', () => {
  const prompt = flows.theft.questions[2];
  assert.match(prompt, /بدون شماره سریال، شناسه دستگاه، پلاک، نشانی دقیق یا مشخصات مالک/);
  assert.equal(Object.hasOwn(flows.theft, 'source'), false);
  assert.equal(Object.hasOwn(flows.theft, 'legalStatus'), false);
  assert.equal(Object.hasOwn(flows.theft, 'enforcementEligibility'), false);
});
