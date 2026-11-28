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

assert.ok(reviewerDetector, 'reviewer identifier detector must exist');
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

const formattedIranianLandlines = [
  'شماره تماس: ۰۲۱/۱۲۳۴۵۶۷۸',
  'شماره تماس: ۰۲۱.۱۲۳۴۵۶۷۸',
  'شماره تماس: (۰۲۱) ۱۲۳۴-۵۶۷۸',
  'شماره تماس: +۹۸ (۲۱) ۱۲۳۴۵۶۷۸',
  'شماره تماس: 021 / 1234 5678'
];

test('free-question privacy gate rejects Iranian landlines separated by slash, dot, spaces or parentheses', () => {
  for (const sample of formattedIranianLandlines) {
    assert.equal(detectsFreeQuestion(sample), true, sample);
  }
  assert.equal(detectsFreeQuestion('چک فرضی با تاریخ ۱۴۰۵/۰۸/۱۸'), false);
});

test('reviewer name and note privacy gate rejects the same punctuated landline formats', () => {
  for (const sample of formattedIranianLandlines) {
    assert.equal(detectsReviewer(sample), true, sample);
  }
  assert.equal(detectsReviewer('یادداشت ساختگی درباره چک فرضی'), false);
});
