'use strict';
// Synthetic-only: collect property-return facts without deciding legal classification.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({ $: () => ({}) });
vm.runInContext(fs.readFileSync(path.join(root, 'flows.js'), 'utf8'), ctx);

test('theft claimant intake records value, return and partial restitution safely', () => {
  const questions = vm.runInContext("questionsFor('theft', 'خواهان / شاکی')", ctx);
  assert.equal(questions.length, 5, 'preserve four common questions and one role question');
  const roleQuestion = questions.at(-1);
  assert.match(roleQuestion, /ارزش تقریبی/);
  assert.match(roleQuestion, /تمام یا بخشی/);
  assert.match(roleQuestion, /بازگردانده شده/);
  assert.match(roleQuestion, /خسارتی پرداخت شده/);
  assert.match(roleQuestion, /زمان تقریبی/);
  assert.match(roleQuestion, /اطلاعات هویتی، نشانی و شماره حساب/);
  assert.match(roleQuestion, /نتیجه رسیدگی کیفری را تعیین نمی‌کند/);
});

test('role-specific restitution prompt is not presented as a witness fact', () => {
  const witness = vm.runInContext("questionsFor('theft', 'شاهد')", ctx);
  assert.equal(witness.length, 5);
  assert.match(witness.at(-1), /شخصاً/);
  assert.doesNotMatch(witness.at(-1), /خسارتی پرداخت شده/);
});
