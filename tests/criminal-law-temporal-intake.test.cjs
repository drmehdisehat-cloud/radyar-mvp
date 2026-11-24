'use strict';
// Synthetic contract: chronology and prior procedural acts matter when the
// applicable version of criminal law may have changed. This is not a legal
// conclusion about retroactivity, prosecution, or compoundability.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('fraud intake distinguishes transaction start, alleged act, and asset transfer dates', () => {
  const first = flows.fraud.questions[0];
  assert.match(first, /چه تاریخی/);
  assert.match(first, /تاریخ تقریبی رفتار ادعایی/);
  assert.match(first, /تاریخ انتقال مال/);
});

test('theft and fraud record procedural chronology without deciding legal effects', () => {
  for (const topic of ['theft', 'fraud']) {
    const prompts = flows[topic].questions;
    assert.equal(prompts.length, 4, topic);
    assert.match(prompts[3], /پرونده در چه مرحله‌ای است/);
    assert.match(prompts[3], /شکایت قبلی/);
    assert.match(prompts[3], /اعلام گذشت/);
    assert.match(prompts[3], /تصمیم قضایی با تاریخ تقریبی/);
    assert.match(prompts[3], /قابل‌گذشت بودن و اثر تغییر قانون بدون بررسی حقوقی قطعی فرض نمی‌شود/);
    assert.equal(Object.hasOwn(flows[topic], 'source'), false);
    for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
      assert.equal(questionsFor(topic, role).length, 5, topic + '/' + role);
    }
  }
});
