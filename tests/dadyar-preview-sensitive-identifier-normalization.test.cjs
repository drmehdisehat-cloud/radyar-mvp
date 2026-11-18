'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const reviewerDetector = html.match(/function hasSensitiveIdentifier\(value\) \{[\s\S]*?\n\}/)?.[0];
const questionNormalizer = html.match(/let normalizedQuestionDigits=[^;]+;/)?.[0];
const questionCompactor = html.match(/let compactIdentifierDigits=[^;]+;/)?.[0];
const questionDetector = html.match(/const hasSensitiveIdentifier=[^;]+;/)?.[0];

assert.ok(reviewerDetector, 'reviewer privacy detector must exist');
assert.ok(questionNormalizer && questionCompactor && questionDetector, 'free-question privacy detector must exist');

function detectsReviewer(value) {
  const context = {};
  vm.runInNewContext(reviewerDetector + '\nglobalThis.detect = value => hasSensitiveIdentifier(value);', context, { timeout: 1000 });
  return context.detect(value);
}

function detectsFreeQuestion(value) {
  const context = { freeQuestion: value };
  vm.runInNewContext([
    questionNormalizer,
    questionCompactor,
    questionDetector,
    'globalThis.detected = hasSensitiveIdentifier;'
  ].join('\n'), context, { timeout: 1000 });
  return context.detected;
}

const punctuatedIdentifiers = [
  'شماره فرضی ۰۹۱۲،۳۴۵،۶۷۸۹',
  'تلفن ثابت فرضی ۰۲۱؛۱۲۳۴۵۶۷۸',
  'کارت فرضی ۶۰۳۷،۹۹۱۲،۳۴۵۶،۷۸۹۰',
  'کد فرضی ۰۰۱،۲۳۴،۵۶۷۸'
];

test('free-question privacy gate catches identifiers split by Persian and Arabic punctuation', () => {
  for (const sample of punctuatedIdentifiers) assert.equal(detectsFreeQuestion(sample), true, sample);
  assert.equal(detectsFreeQuestion('سناریوی چک فرضی، مبلغ ۱۰۰۰۰۰۰۰۰ ریال'), false);
  assert.equal(detectsFreeQuestion('تاریخ فرضی ۱۴۰۵/۰۸/۲۷ و شماره نمونه ۱۲۳۴'), false);
});

test('reviewer name and note privacy gate catches the same punctuated identifiers', () => {
  for (const sample of punctuatedIdentifiers) assert.equal(detectsReviewer(sample), true, sample);
  assert.equal(detectsReviewer('یادداشت ساختگی درباره چک فرضی'), false);
});

test('privacy normalization strips Unicode punctuation only between digits and retains non-reflection', () => {
  assert.ok(html.includes('[\\p{P}\\p{Z}\\s'));
  assert.match(html, /freeQuestionField\.value='';/);
  assert.match(html, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
  assert.match(html, /exportEligible=conflicts\.length===0 && unresolved\.length===0/);
});
