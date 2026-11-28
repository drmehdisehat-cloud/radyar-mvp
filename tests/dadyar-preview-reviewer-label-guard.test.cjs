'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'offline preview script must exist');

function extractFunction(signature) {
  const start = script.indexOf(signature);
  assert.ok(start >= 0, 'missing function: ' + signature);
  const end = script.indexOf('\n}', start);
  assert.ok(end > start, 'function boundary missing: ' + signature);
  return script.slice(start, end + 2);
}

test('reviewer label is fixed to a synthetic value, not a user-supplied identity', () => {
  assert.match(script, /const SYNTHETIC_REVIEWER_LABEL='بازبین آزمون';/);
  const field = html.match(/<input[^>]*id="reviewer-name"[^>]*>/)?.[0] || '';
  assert.match(field, /readonly/);
  assert.match(field, /value="بازبین آزمون"/);
  assert.match(extractFunction('function reviewerDetailsAreSafe()'), /safeReviewText\(reviewerName\.value,80\)===SYNTHETIC_REVIEWER_LABEL/);
  assert.match(extractFunction('function showReviewerPrivacyWarning()'), /reviewerName\.value=SYNTHETIC_REVIEWER_LABEL/);
});

test('DOM tampering with the readonly reviewer label fails closed and is reset', () => {
  const pieces = [
    "const SYNTHETIC_REVIEWER_LABEL='بازبین آزمون';",
    extractFunction('function safeReviewText(value,max)'),
    extractFunction('function hasSensitiveIdentifier(value)'),
    extractFunction('function reviewerDetailsAreSafe()'),
    extractFunction('function showReviewerPrivacyWarning()')
  ];
  const sandbox = {
    reviewerName: { value: 'بازبین آزمون' },
    reviewNote: { value: 'یادداشت ساختگی برای بررسی' },
    recordReviewButton: { disabled: false }
  };
  sandbox.invalidateHumanReview = message => { sandbox.lastMessage = message; };
  vm.runInNewContext(pieces.join('\n') + '\nthis.safe=reviewerDetailsAreSafe;this.warn=showReviewerPrivacyWarning;', sandbox, { timeout: 1000 });
  assert.equal(sandbox.safe(), true, 'the fixed synthetic label should pass');
  sandbox.reviewerName.value = 'نام واقعی یا دلخواه';
  assert.equal(sandbox.safe(), false, 'a changed label must not be accepted as reviewer identity');
  sandbox.warn();
  assert.equal(sandbox.reviewerName.value, 'بازبین آزمون', 'tampered label must be restored');
  assert.equal(sandbox.recordReviewButton.disabled, true, 'review recording must remain blocked');
  assert.match(sandbox.lastMessage, /برچسب بازبین در پیش‌نمایش باید ثابت و ساختگی بماند/);
  assert.equal(sandbox.safe(), true, 'the fixed synthetic label is restored after rejection');
});

test('sensitive reviewer note is cleared and cannot authorize a local review', () => {
  const pieces = [
    "const SYNTHETIC_REVIEWER_LABEL='بازبین آزمون';",
    extractFunction('function safeReviewText(value,max)'),
    extractFunction('function hasSensitiveIdentifier(value)'),
    extractFunction('function reviewerDetailsAreSafe()'),
    extractFunction('function showReviewerPrivacyWarning()')
  ];
  const sandbox = {
    reviewerName: { value: 'بازبین آزمون' },
    reviewNote: { value: 'شماره همراه: ۰۹۱۲۳۴۵۶۷۸۹' },
    recordReviewButton: { disabled: false }
  };
  sandbox.invalidateHumanReview = message => { sandbox.lastMessage = message; };
  vm.runInNewContext(pieces.join('\n') + '\nthis.safe=reviewerDetailsAreSafe;this.warn=showReviewerPrivacyWarning;', sandbox, { timeout: 1000 });
  assert.equal(sandbox.safe(), false);
  sandbox.warn();
  assert.equal(sandbox.reviewNote.value, '');
  assert.equal(sandbox.recordReviewButton.disabled, true);
  assert.match(sandbox.lastMessage, /شناسه حساس/);
});

test('review click handler rechecks the fixed reviewer label before recording any approval', () => {
  const start = script.indexOf("recordReviewButton.addEventListener('click',async()=>{");
  assert.ok(start >= 0, 'review click handler missing');
  const handler = script.slice(start, script.indexOf('});', start) + 3);
  assert.match(handler, /if\(!reviewerDetailsAreSafe\(\)\)\{showReviewerPrivacyWarning\(\);return;\}/);
});
