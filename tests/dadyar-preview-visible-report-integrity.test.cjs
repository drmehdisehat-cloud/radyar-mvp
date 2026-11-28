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
  const end = script.indexOf('// Clear unsubmitted free text', start);
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
    downloadDigestPending: false,
    approvedReviewMatches: (snapshot, visibleText, record) => Boolean(snapshot && visibleText === snapshot && record && record.decision === 'approved'),
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

test('approved review must match the fixed synthetic reviewer, exact checklist and current report', () => {
  const sandbox = {
    reviewChecklistItems: ['review-check-facts','review-check-conflicts','review-check-sources','review-check-privacy'].map((id,index)=>({
      id,
      closest: () => ({ textContent: ['facts','conflicts','sources','privacy'][index] })
    })),
    SYNTHETIC_REVIEWER_LABEL: 'بازبین آزمون',
    safeReviewText: (value,max) => String(value || '').normalize('NFC').replace(/\s+/g,' ').trim().slice(0,max),
    hasSensitiveIdentifier: value => /\p{Nd}{10,}/u.test(String(value || ''))
  };
  const helper = extractFunction('function approvedReviewMatches(');
  vm.runInNewContext(helper + '\nglobalThis.__matches=approvedReviewMatches;', sandbox, { timeout: 1000 });
  const snapshot = 'گزارش کاملاً ساختگی';
  const candidate = {
    reviewer: 'بازبین آزمون',
    decision: 'approved',
    reportSnapshot: snapshot,
    reportSha256: 'a'.repeat(64),
    reviewedAt: '2026-11-28T15:00:00.000Z',
    note: 'یادداشت ساختگی برای آزمون',
    checklist: ['review-check-facts','review-check-conflicts','review-check-sources','review-check-privacy'].map((id,index)=>({
      id, checked: true, label: ['facts','conflicts','sources','privacy'][index]
    }))
  };
  assert.equal(sandbox.__matches(snapshot,snapshot,candidate), true);
  assert.equal(sandbox.__matches(snapshot,snapshot,{...candidate,decision:'rejected'}), false);
  assert.equal(sandbox.__matches(snapshot,snapshot,{...candidate,reviewer:'نام دیگر'}), false);
  assert.equal(sandbox.__matches(snapshot,snapshot,{...candidate,reportSnapshot:'گزارش دیگر'}), false);
  assert.equal(sandbox.__matches(snapshot,snapshot,{...candidate,reportSha256:'not-a-hash'}), false);
  assert.equal(sandbox.__matches(snapshot,snapshot,{...candidate,checklist:candidate.checklist.slice(1)}), false);
  assert.equal(sandbox.__matches(snapshot,snapshot,{...candidate,checklist:candidate.checklist.map((item,index)=>index===1?{...item,id:'review-check-facts'}:item)}), false);
  assert.equal(sandbox.__matches(snapshot,snapshot,{...candidate,note:'شماره ۱۲۳۴۵۶۷۸۹۰'}), false);
  assert.equal(sandbox.__matches(snapshot,'متن قابل مشاهده متفاوت',candidate), false);
});

test('download validates the exact approved snapshot synchronously before creating the file', () => {
  const start = script.indexOf("document.getElementById('download').addEventListener('click',()=>{");
  const end = script.indexOf('\\n});', start);
  assert.ok(start >= 0 && end > start, 'synchronous download handler must exist');
  const handler = script.slice(start, end);
  assert.ok(handler.includes('approvedReviewMatches(snapshot,out.textContent,candidate)'));
  assert.ok(handler.includes('candidate.reportSnapshot===snapshot') === false, 'snapshot matching is enforced by the shared validator');
  assert.ok(handler.indexOf('approvedReviewMatches(snapshot,out.textContent,candidate)') < handler.indexOf('URL.createObjectURL(new Blob'));
  assert.equal(handler.includes('await '), false, 'download must remain in the user-activation task');
});

test('download rechecks the visible report and clears the draft if it changed after approval', () => {
  assert.ok(script.includes("document.getElementById('download').addEventListener('click',()=>{"));
  assert.ok(script.includes('if(!report || downloadButton.disabled)return;'));
  assert.ok(script.includes('const snapshot=report;'));
  assert.ok(script.includes('const candidate=reviewRecord;'));
  assert.ok(script.includes('if(out.textContent!==snapshot){invalidateDraft();'));
});
