'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'offline preview browser script must exist');

function extractFunction(signature) {
  const start = script.indexOf(signature);
  assert.ok(start >= 0, 'missing function: ' + signature);
  const end = script.indexOf('\n}', start);
  assert.ok(end > start, 'function boundary missing: ' + signature);
  return script.slice(start, end + 2);
}

test('a changed visible report disables review and export even when a prior approval exists', () => {
  const sandbox = {
    report: 'نسخه اصلی گزارش ساختگی',
    out: { textContent: 'نسخه دست‌کاری‌شده‌ای که بازبین می‌بیند' },
    reviewRecord: {
      decision: 'approved',
      reportSnapshot: 'نسخه اصلی گزارش ساختگی',
      reportSha256: 'a'.repeat(64),
      checklist: Array.from({ length: 4 }, () => ({ checked: true }))
    },
    exportEligible: true,
    exportAck: { checked: true },
    downloadButton: { disabled: false },
    recordReviewButton: { disabled: false },
    reviewDigestPending: false,
    reviewerName: { value: 'بازبین آزمون' },
    reviewNote: { value: 'یادداشت ساختگی برای آزمون' },
    reviewDecision: { value: 'approved' },
    safeReviewText: (value, max) => String(value || '').trim().slice(0, max),
    reviewerDetailsAreSafe: () => true,
    reviewChecklistComplete: () => true
  };

  vm.runInNewContext(extractFunction('function updateExportPermission()') + '\nupdateExportPermission();', sandbox, { timeout: 1000 });
  assert.equal(sandbox.downloadButton.disabled, true, 'a mismatched visible report must never be downloadable');
  assert.equal(sandbox.recordReviewButton.disabled, true, 'a mismatched visible report must never be approved');
});

test('review registration checks the exact visible report before and after asynchronous hashing', () => {
  assert.match(script, /recordReviewButton\.addEventListener\('click',async\(\)=>\{\s*if\(out\.textContent!==report\)\{invalidateDraft\(\);/);
  assert.match(script, /const unchanged=report===snapshot && out\.textContent===snapshot/);
});

test('download rechecks the visible report and clears the draft if it changed after approval', () => {
  assert.match(script, /document\.getElementById\('download'\)\.addEventListener\('click',\(\)=>\{\s*if\(!report \|\| downloadButton\.disabled\)return;\s*if\(out\.textContent!==report\)\{invalidateDraft\(\);/);
});
