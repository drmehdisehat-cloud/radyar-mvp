'use strict';
// Synthetic privacy regression: arbitrary names and addresses must never be echoed,
// even when they do not match the narrow identifier detector.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const hintsSource = html.match(/const topicHints = (\[[\s\S]*?\n\]);\nfunction normalizeTopicText/)?.[1];
const helperSource = html.match(/function normalizeTopicText\(value\) \{[\s\S]*?function describeTopicScope\(matches, question\) \{[\s\S]*?\n\}/)?.[0];
const privacyStart = html.indexOf(' const normalizedQuestionDigits=');
const privacyEnd = html.indexOf(' const questionOutsideChequeScope=', privacyStart);
const privacySource = privacyStart >= 0 && privacyEnd > privacyStart ? html.slice(privacyStart, privacyEnd) : '';

function summarize(raw) {
  assert.ok(hintsSource, 'internal topic hints missing');
  assert.ok(helperSource, 'topic classifier helpers missing');
  assert.ok(privacySource, 'privacy-safe question handling missing');
  const field = { value: raw };
  const status = { textContent: '' };
  const sandbox = { freeQuestion: raw, freeQuestionField: field, topicScopeStatus: status };
  vm.runInNewContext(
    'const topicHints = ' + hintsSource + ';\n' +
    helperSource + ';\n' +
    'let internalTopicMatches = [];\n' +
    privacySource + ';\n' +
    'globalThis.result = { displayQuestion, topicScopeMessage, fieldValue: freeQuestionField.value, matches: internalTopicMatches };',
    sandbox,
    { timeout: 1000 }
  );
  return sandbox.result;
}

test('unrecognized synthetic name and street address are never reflected in the preview summary', () => {
  const raw = 'نام فرضی: نسترن آذرخش؛ نشانی ساختگی: خیابان نمونه، پلاک ۱۲؛ جزئیات خصوصی پرونده';
  const result = summarize(raw);
  assert.equal(result.fieldValue, '');
  assert.equal(result.displayQuestion, 'متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود');
  assert.equal(result.displayQuestion.includes('نسترن آذرخش'), false);
  assert.equal(result.topicScopeMessage.includes('خیابان نمونه'), false);
  assert.equal(JSON.stringify(result).includes(raw), false);
});

test('multi-topic synthetic question with arbitrary identity details is routed internally but not echoed', () => {
  const raw = 'چک و اجاره؛ نام فرضی: نسترن آذرخش؛ نشانی ساختگی: خیابان نمونه پلاک ۱۲';
  const result = summarize(raw);
  assert.equal(result.fieldValue, '');
  assert.ok(result.matches.some(item => item.id === 'instruments'));
  assert.ok(result.matches.some(item => item.id === 'property'));
  assert.equal(result.displayQuestion.includes('نسترن آذرخش'), false);
  assert.equal(result.topicScopeMessage.includes('خیابان نمونه'), false);
  assert.equal(JSON.stringify(result).includes(raw), false);
});

test('the generated report consumes only the privacy-safe display summary, never raw free text', () => {
  const reportStart = html.indexOf("report=['");
  const reportEnd = html.indexOf('out.textContent=report', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'report construction block missing');
  const reportSource = html.slice(reportStart, reportEnd);
  assert.match(reportSource, /displayQuestion/);
  assert.doesNotMatch(reportSource, /\bfreeQuestion\b/);
  assert.match(html, /freeQuestionField\.value='';/);
});
