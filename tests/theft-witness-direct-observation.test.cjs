'use strict';
// Synthetic-only witness intake: separate direct observations from hearsay,
// preserve original evidence, and never request identifiers or decide guilt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('theft witness records firsthand observations separately from hearsay', () => {
  const witnessQuestions = questionsFor('theft', 'شاهد');
  assert.equal(witnessQuestions.length, 5);
  const prompt = witnessQuestions.at(-1);
  assert.match(prompt, /اطلاع مستقیم/);
  assert.match(prompt, /فقط از دیگران شنیده‌اید/);
  assert.match(prompt, /برداشتن مال، تحویل با رضایت، تهدید یا بازگرداندن مال/);
  assert.match(prompt, /زمان تقریبی، فاصله و امکان مشاهده/);
});

test('witness evidence is privacy-safe and no criminal conclusion is implied', () => {
  const witness = questionsFor('theft', 'شاهد').at(-1);
  assert.match(witness, /فایل اصلی را بدون تغییر نگه دارید/);
  assert.match(witness, /اطلاعات هویتی اشخاص، شماره تماس، پلاک یا نشانی را وارد نکنید/);
  assert.match(witness, /به‌تنهایی وقوع جرم یا اعتبار شهادت را اثبات نمی‌کنند/);
  assert.doesNotMatch(questionsFor('theft', 'خوانده / متهم').at(-1), /فقط از دیگران شنیده‌اید/);
  assert.doesNotMatch(questionsFor('theft', 'خواهان / شاکی').at(-1), /فقط از دیگران شنیده‌اید/);
  assert.equal(Object.hasOwn(flows.theft, 'source'), false);
});
