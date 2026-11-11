'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const permissionSource = html.match(/function updateExportPermission\(\)\{[\s\S]*?\n\}/)?.[0];
const handlerSource = html.match(/document\.getElementById\('download'\)\.addEventListener\('click',\(\)=>\{([\s\S]*?)\n\}\);/)?.[1];

function makeState(overrides = {}) {
  const downloads = [];
  const blobs = [];
  const revoked = [];
  const anchor = {
    href: '',
    download: '',
    click() { downloads.push({ href: this.href, filename: this.download }); }
  };
  const state = {
    report: 'گزارش کاملاً ساختگی دادیار',
    exportEligible: true,
    reviewRecord: {
      reviewer: 'بازبین نمونه',
      decision: 'approved',
      note: 'بازبینی داده ساختگی',
      reviewedAt: '2026-11-11T08:00:00.000Z',
      reportSnapshot: 'گزارش کاملاً ساختگی دادیار'
    },
    exportAck: { checked: true },
    downloadButton: { disabled: false },
    recordReviewButton: { disabled: false },
    reviewerName: { value: 'بازبین نمونه' },
    reviewDecision: { value: 'approved' },
    reviewNote: { value: 'بازبینی داده ساختگی' },
    reviewStatus: { textContent: '' },
    exportStatus: { textContent: '' },
    safeReviewText: (value, max) => String(value || '').slice(0, max),
    URL: {
      createObjectURL(blob) { blobs.push(blob); return 'blob:synthetic-report'; },
      revokeObjectURL(url) { revoked.push(url); }
    },
    Blob: class {
      constructor(parts, options) { this.parts = parts; this.options = options; }
    },
    document: {
      createElement(tag) { assert.equal(tag, 'a'); return anchor; }
    },
    setTimeout(callback) { callback(); return 1; }
  };
  Object.assign(state, overrides);
  state.downloads = downloads;
  state.blobs = blobs;
  state.revoked = revoked;
  state.anchor = anchor;
  return state;
}

function applyActualPermissionFunction(state) {
  assert.ok(permissionSource, 'actual export permission function missing');
  vm.runInNewContext(permissionSource + '\nupdateExportPermission();', state);
}

test('approved review exports exactly once and consumes the approval', () => {
  assert.ok(handlerSource, 'actual download handler missing');
  const state = makeState();
  applyActualPermissionFunction(state);
  assert.equal(state.downloadButton.disabled, false);

  const downloadHandler = vm.runInNewContext('(function(){\n' + handlerSource + '\n})', state);
  downloadHandler();

  assert.equal(state.downloads.length, 1);
  assert.equal(state.anchor.download, 'dadyar-synthetic-cheque.txt');
  assert.equal(state.blobs.length, 1);
  const exported = state.blobs[0].parts.join('');
  assert.match(exported, /گزارش کاملاً ساختگی دادیار/);
  assert.match(exported, /ثبت بازبینی انسانی \(اظهار محلی؛ هویت احراز نشده\)/);
  assert.match(exported, /نام بازبین: بازبین نمونه/);
  assert.match(exported, /نتیجه بازبینی: تأیید برای دریافت آموزشی/);
  assert.match(exported, /محدودیت: این اظهار محلی است و تأیید حقوقی یا احراز هویت محسوب نمی‌شود/);
  assert.equal(state.reviewRecord, null);
  assert.equal(state.exportAck.checked, false);
  assert.equal(state.downloadButton.disabled, true);
  assert.match(state.reviewStatus.textContent, /بازبینی تازه/);
  assert.equal(state.revoked[0], 'blob:synthetic-report');

  downloadHandler();
  assert.equal(state.downloads.length, 1, 'a second download must be blocked until a fresh review');
});

test('export permission fails closed for rejected, stale, or unacknowledged reviews', () => {
  for (const overrides of [
    { reviewRecord: { decision: 'rejected', reportSnapshot: 'گزارش کاملاً ساختگی دادیار' } },
    { reviewRecord: { decision: 'approved', reportSnapshot: 'گزارش دیگری' } },
    { exportAck: { checked: false } },
    { reviewRecord: null }
  ]) {
    const state = makeState(overrides);
    applyActualPermissionFunction(state);
    assert.equal(state.downloadButton.disabled, true);
  }
});

test('the actual download handler has no network or browser-persistence sink', () => {
  assert.ok(handlerSource, 'actual download handler missing');
  assert.doesNotMatch(handlerSource, /\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB)\b/);
});
