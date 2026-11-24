'use strict';
// Synthetic contract: a complainant may report a solicitation without transfer.
// No assumption of a completed offense, loss, or legally established fraud.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('fraud claimant role does not assume a transfer occurred', () => {
  const question = questionsFor('fraud', 'خواهان / شاکی')[4];
  assert.match(question, /آیا وجه یا مالی واقعاً منتقل شده/);
  assert.match(question, /فقط درخواست پرداخت یا تلاش برای دریافت/);
  assert.match(question, /اگر انتقالی انجام شده/);
  assert.match(question, /اطلاعات بانکی محرمانه ننویسید/);
  assert.doesNotMatch(question, /^پس از پرداخت یا تحویل مال/);
  assert.equal(flows.fraud.questions.length, 4);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('fraud', role).length, 5);
  }
  assert.equal(Object.hasOwn(flows.fraud, 'source'), false);
});
