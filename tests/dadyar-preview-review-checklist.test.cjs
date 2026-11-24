'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const sectionStart = html.indexOf('<section id="human-review"');
const sectionEnd = html.indexOf('<button type="button" id="download"', sectionStart);
const section = html.slice(sectionStart, sectionEnd);
const checklistIds = [
  'review-check-facts',
  'review-check-conflicts',
  'review-check-sources',
  'review-check-privacy'
];
const helperSource = html.match(/function reviewChecklistComplete\(\)\{[\s\S]*?\n\}/)?.[0];
const permissionSource = html.match(/function updateExportPermission\(\)\{[\s\S]*?\n\}/)?.[0];

test('offline review UI requires all four explicit checklist items before a decision can be recorded', () => {
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart, 'human-review section missing');
  assert.match(section, /چک‌لیست اجباری بازبینی پیش از ثبت تصمیم/);
  assert.equal((section.match(/type="checkbox" id="review-check-/g) || []).length, 4);
  for (const id of checklistIds) assert.match(section, new RegExp('id="' + id + '"'));
  assert.match(section, /اصالت هیچ مدرکی احراز نشده است/);
  assert.match(section, /نبود منبع رسمی تأییدشده/);
  assert.match(section, /فقط داده ساختگی/);
});

test('checklist completeness helper requires exactly four checked controls', () => {
  assert.ok(helperSource, 'review checklist helper missing');
  const context = { reviewChecklistItems: checklistIds.map(() => ({ checked: true })) };
  vm.runInNewContext(helperSource + '\nthis.complete = reviewChecklistComplete();', context);
  assert.equal(context.complete, true);
  context.reviewChecklistItems[2].checked = false;
  vm.runInNewContext(helperSource + '\nthis.complete = reviewChecklistComplete();', context);
  assert.equal(context.complete, false);
  context.reviewChecklistItems.pop();
  vm.runInNewContext(helperSource + '\nthis.complete = reviewChecklistComplete();', context);
  assert.equal(context.complete, false);
});

test('export permission fails closed until the complete checklist and local acknowledgement exist', () => {
  assert.ok(permissionSource, 'actual export permission function missing');
  const context = {
    reviewChecklistItems: checklistIds.map(() => ({ checked: false })),
    reviewChecklistComplete: () => false,
    reviewRecord: null,
    report: 'گزارش ساختگی',
    downloadButton: { disabled: false },
    recordReviewButton: { disabled: false },
    exportEligible: true,
    exportAck: { checked: true },
    safeReviewText: (value, max) => String(value || '').slice(0, max),
    reviewerName: { value: 'بازبین آزمون' },
    reviewNote: { value: 'بازبینی ساختگی کامل شد' },
    reviewDecision: { value: 'approved' },
    reviewerDetailsAreSafe: () => true
  };
  vm.runInNewContext(permissionSource + '\nupdateExportPermission();', context);
  assert.equal(context.recordReviewButton.disabled, true);
  assert.equal(context.downloadButton.disabled, true);

  context.reviewChecklistItems.forEach(item => { item.checked = true; });
  context.reviewChecklistComplete = () => true;
  vm.runInNewContext(permissionSource + '\nupdateExportPermission();', context);
  assert.equal(context.recordReviewButton.disabled, false);
  assert.equal(context.downloadButton.disabled, true, 'report must remain blocked until a review record exists');

  context.reviewRecord = {
    decision: 'approved',
    reportSnapshot: context.report,
    checklist: checklistIds.map(id => ({ id, checked: true, label: id }))
  };
  vm.runInNewContext(permissionSource + '\nupdateExportPermission();', context);
  assert.equal(context.downloadButton.disabled, false);

  context.reviewRecord.checklist[3].checked = false;
  vm.runInNewContext(permissionSource + '\nupdateExportPermission();', context);
  assert.equal(context.downloadButton.disabled, true);
});

test('changing checklist invalidates a prior approval and exported report includes the reviewed items', () => {
  assert.match(html, /reviewChecklistItems\.forEach\(item=>item\.addEventListener\('change',\(\)=>invalidateHumanReview/);
  assert.match(html, /checklist:reviewChecklistItems\.map\(item=>\(\{id:item\.id,checked:item\.checked,label:item\.closest\('label'\)\.textContent\.trim\(\)\}\)\)/);
  assert.match(html, /'موارد بررسی‌شده:\\n'\+reviewRecord\.checklist\.filter\(item=>item\.checked\)/);
  assert.match(html, /reviewChecklistItems\.forEach\(item=>\{item\.checked=false;\}\)/);
  const reviewSection = html.slice(sectionStart, sectionEnd);
  assert.match(reviewSection, /هویت یا سمت بازبین احراز نمی‌شود/);
  assert.match(reviewSection, /این مرحله فقط جریان بازبینی آفلاین را نمایش می‌دهد/);
});

test('review checklist adds no network or persistent browser storage capability', () => {
  const reviewLogic = html.slice(html.indexOf('const reviewChecklistItems='), html.indexOf('// BEGIN delay-damages calculator'));
  assert.doesNotMatch(reviewLogic, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB)\b/);
  assert.match(html, /connect-src 'none'/);
});
