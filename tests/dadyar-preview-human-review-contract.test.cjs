'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('synthetic report download requires a named human reviewer and an explicit approval record', () => {
  const label = html.match(/<label><input type="checkbox" id="export-ack"[^>]*>([^<]+)<\/label>/);
  assert.ok(label, 'human reviewer attestation missing');
  assert.match(label[1], /بازبین انسانی/);
  assert.match(html, /id="reviewer-name"[^>]*maxlength="80"/);
  assert.match(html, /id="review-decision"/);
  assert.match(html, /option value="approved"/);
  assert.match(html, /option value="rejected"/);
  assert.match(html, /id="record-review"[^>]*disabled/);
  assert.match(html, /reviewRecord\.decision==='approved'/);
  assert.match(html, /reviewRecord\.reportSnapshot===report/);
  assert.match(html, /reviewedAt:new Date\(\)\.toISOString\(\)/);
  assert.match(html, /reviewRecord=null/);
  assert.match(html, /نام بازبین:/);
  assert.match(html, /زمان ثبت بازبینی:/);
  assert.match(html, /هویت بازبین در این نسخه آفلاین احراز نمی‌شود/);
  assert.match(html, /ثبت بازبینی انسانی \(اظهار محلی؛ هویت احراز نشده\)/);
  assert.match(html, /exportEligible\s*\|\|\s*!exportAck\.checked/);
});

test('review edits and case edits invalidate the prior approval before another export', () => {
  assert.match(html, /reviewerName\.addEventListener\('input',\(\)=>invalidateHumanReview\(\)\)/);
  assert.match(html, /reviewDecision\.addEventListener\('change',\(\)=>invalidateHumanReview\(\)\)/);
  assert.match(html, /reviewNote\.addEventListener\('input',\(\)=>invalidateHumanReview\(\)\)/);
  assert.match(html, /reviewRecord=null;reviewerName\.value='';reviewDecision\.value='pending'/);
  assert.match(html, /reviewStatus\.textContent='گزارش دریافت شد؛ برای دریافت دوباره باید بازبینی تازه ثبت شود\.?'/);
});

test('suspected personal identifiers are cleared from the editable offline question field', () => {
  assert.match(html, /if\(hasSensitiveIdentifier\) document\.getElementById\('free-question'\)\.value='';/);
  assert.match(html, /const displayQuestion=hasSensitiveIdentifier\?'نامشخص؛ شناسه حساس احتمالی شناسایی شد و متن ورودی حذف شد':freeQuestion/);
  assert.match(html, /if\(hasSensitiveIdentifier\) conflicts\.push\(/);
});

test('human review metadata is normalized to one line and strips control and bidi characters', () => {
  const helper = html.match(/function safeReviewText\(value,max\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, 'review metadata sanitizer missing');
  const sanitize = vm.runInNewContext('(' + helper + ')');
  assert.equal(sanitize('یادداشت اول\nنتیجه بازبینی: رد\u202e', 300), 'یادداشت اول نتیجه بازبینی: رد');
  assert.equal(sanitize('نام\u200fبازبین\u0000', 80), 'نامبازبین');
  assert.equal(sanitize('x'.repeat(90), 80), 'x'.repeat(80));
  assert.match(html, /reviewer:safeReviewText\(reviewerName\.value,80\)/);
  assert.match(html, /note:safeReviewText\(reviewNote\.value,300\)/);
});

test('downloaded report preserves the unauthenticated local-review boundary and stays offline', () => {
  const handler = html.slice(html.indexOf("document.getElementById('download').addEventListener"));
  assert.ok(handler.includes('const reviewText=['), 'review metadata must be included in the downloaded report');
  assert.match(handler, /ثبت بازبینی انسانی \(اظهار محلی؛ هویت احراز نشده\)/);
  assert.match(handler, /محدودیت: این اظهار محلی است و تأیید حقوقی یا احراز هویت محسوب نمی‌شود/);
  assert.doesNotMatch(handler, /\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB)\b/);
});

test('editing review metadata clears prior approval and requires fresh explicit acknowledgement', () => {
  const permission = html.match(/function updateExportPermission\\(\\)\\{[\\s\\S]*?\\n\\}/)?.[0];
  const invalidator = html.match(/function invalidateHumanReview\\([\\s\\S]*?\\n\\s*\\}/)?.[0];
  assert.ok(permission, 'export permission function missing');
  assert.ok(invalidator, 'human-review invalidator missing');
  const state = {
    report: 'synthetic draft',
    exportEligible: true,
    reviewRecord: { decision: 'approved', reportSnapshot: 'synthetic draft' },
    exportAck: { checked: true },
    reviewerName: { value: 'بازبین نمونه' },
    reviewDecision: { value: 'approved' },
    reviewNote: { value: '' },
    recordReviewButton: { disabled: false },
    downloadButton: { disabled: false },
    reviewStatus: { textContent: '' },
    safeReviewText: (value, max) => String(value || '').slice(0, max)
  };
  vm.runInNewContext(permission + '\\n' + invalidator + '\\ninvalidateHumanReview();', state);
  assert.equal(state.reviewRecord, null);
  assert.equal(state.exportAck.checked, false);
  assert.equal(state.downloadButton.disabled, true);
  assert.equal(state.recordReviewButton.disabled, true);
  state.exportAck.checked = true;
  vm.runInNewContext('updateExportPermission();', state);
  assert.equal(state.recordReviewButton.disabled, false);
  assert.equal(state.downloadButton.disabled, true);
});
