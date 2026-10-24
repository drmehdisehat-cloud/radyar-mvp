'use strict';
// Synthetic contract only: theft intake gathers legally relevant facts without
// assigning a criminal label, punishment, venue, or source-verification status.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(source +
  '\n({ flows, questionsFor })');

test('theft intake asks about timing, violence, participation and entry method', () => {
  const questions = flows.theft.questions;
  assert.equal(questions.length, 4, 'preserve the existing interview contract');
  assert.match(questions[0], /تاریخ/);
  assert.match(questions[0], /ساعت/);
  assert.match(questions[0], /روز یا شب/);
  assert.match(questions[0], /محل سکونت/);
  assert.match(questions[1], /تهدید/);
  assert.match(questions[1], /سلاح/);
  assert.match(questions[1], /جرح/);
  assert.match(questions[1], /مستقیماً/);
  assert.match(questions[2], /یک نفر یا چند نفر/);
  assert.match(questions[2], /شکستن قفل یا حرز/);
  assert.match(questions[2], /مأمور/);
  assert.match(questions[2], /شاهد/);
  assert.match(questions[3], /مرجع قضایی/);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('theft', role).length, 5);
  }
});

test('theft fact collection is not a verified legal classification', () => {
  assert.equal(Object.hasOwn(flows.theft, 'source'), false);
  assert.ok(flows.theft.docs.some(x => /مدارک پزشکی/.test(x)));
  assert.ok(flows.theft.docs.some(x => /شهود/.test(x)));
});
