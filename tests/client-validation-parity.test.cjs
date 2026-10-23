'use strict';
// Synthetic inputs only. Guard the browser/backend contract before any preview.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const { validateCase } = require('../backend/validation.js');

const start = client.indexOf('const UNSAFE_TEXT =');
const end = client.indexOf('function show(', start);
assert.ok(start >= 0 && end > start, 'Browser text validator is absent');
const safeCaseText = vm.runInNewContext(
  client.slice(start, end) + '\nsafeCaseText',
  Object.create(null),
  { timeout: 500 }
);
assert.equal(typeof safeCaseText, 'function');
assert.match(client, /if\s*\(!safeCaseText\(rawStory,\s*10,\s*5000\)\)/,
  'Story submission must call the shared-boundary client validator');
assert.match(client, /if\s*\(!safeCaseText\(rawAnswer,\s*1,\s*2000\)\)/,
  'Answer submission must call the shared-boundary client validator');

const cases = [
  ['Persian words', 'شرح ساختگی برای بررسی پرونده', true, true],
  ['Persian half-space', 'شرح ساختگی با نیم\u200cفاصله', true, true],
  ['ordinary newline', 'شرح آزمایشی\nبا خط دوم', true, true],
  ['ordinary punctuation', 'این یک شرح نمونه است!', true, true],
  ['minimum story boundary', 'abcdefghij', true, true],
  ['too short story', 'abcdefghi', false, true],
  ['blank story', '            ', false, false],
  ['only punctuation', '...........', false, false],
  ['only emoji', '😀😀😀😀😀😀😀😀😀😀', false, false],
  ['bidi override', 'شرح پرونده \u202E آزمایشی', false, false],
  ['zero width space', 'شرح پرونده\u200B آزمایشی', false, false],
  ['control byte', 'شرح پرونده\u0001 آزمایشی', false, false],
  ['lone surrogate', 'شرح پرونده \uD800 آزمایشی', false, false],
  ['valid surrogate pair', 'شرح پرونده 😀 آزمایشی', true, true],
  ['max story', 'a'.repeat(5000), true, false],
  ['overlong story', 'a'.repeat(5001), false, false],
  ['max answer', 'b'.repeat(2000), true, true],
  ['overlong answer', 'b'.repeat(2001), true, false],
  ['single answer', 'پ', false, true],
];
let checked = 0;
for (const [name, value, storyExpected, answerExpected] of cases) {
  const base = { topic: 'theft', role: 'شاهد', story: 'شرح ساختگی برای بررسی پرونده', answers: ['۱', '۲', '۳', '۴', '۵'] };
  const serverStory = !validateCase({ ...base, story: value }).errors.includes('story');
  const serverAnswer = !validateCase({ ...base, answers: [value, '۲', '۳', '۴', '۵'] }).errors.includes('answers');
  const clientStory = safeCaseText(value, 10, 5000);
  const clientAnswer = safeCaseText(value, 1, 2000);
  assert.equal(clientStory, serverStory, `Client/server story mismatch: ${name}`);
  assert.equal(clientAnswer, serverAnswer, `Client/server answer mismatch: ${name}`);
  assert.equal(clientStory, storyExpected, `Unexpected story verdict: ${name}`);
  assert.equal(clientAnswer, answerExpected, `Unexpected answer verdict: ${name}`);
  checked += 2;
}
console.log(`PASS: ${checked} client/server text validation comparisons across ${cases.length} synthetic fixtures`);
