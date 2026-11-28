'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

assert.ok(script, 'preview browser logic must be present');

test('the preview identifies its review step as local and unauthenticated', () => {
  assert.match(html, /بازبینی محلی توسط انسان \(بدون احراز هویت\)/);
  assert.match(html, /ثبت بازبینی در این صفحه محلی است و هویت بازبین احراز نمی‌شود/);
  assert.match(html, /این اظهار به معنای تأیید قانونی، اصالت مدارک یا بررسی مستقل متخصص نیست و هویت، سمت یا استقلال مرا احراز نمی‌کند/);
});

test('the reviewer field is a fixed synthetic label and the UI does not imply an editable identity', () => {
  const reviewerTag = html.match(/<input[^>]*id="reviewer-name"[^>]*>/)?.[0] || '';
  assert.ok(reviewerTag, 'reviewer label input must exist');
  assert.match(reviewerTag, /readonly/);
  assert.match(reviewerTag, /aria-readonly="true"/);
  assert.match(reviewerTag, /value="بازبین آزمون"/);
  assert.ok(html.includes("برچسب ثابت بازبین (غیرقابل ویرایش؛ فقط داده ساختگی)"));
  assert.ok(html.includes("برچسب ثابت «بازبین آزمون» نمایش داده می‌شود؛ بازبین فقط نتیجه و یادداشت ساختگی را ثبت می‌کند."));
  assert.ok(html.includes("این برچسب نام یا هویت شخص نیست."));
  assert.ok(!html.includes("بازبین می‌تواند نام، نتیجه و یادداشت خود را ثبت کند."));
});

test('report download requires a fully matching approved review record', () => {
  for (const required of [
    'function approvedReviewMatches(snapshot,visibleText,candidate)',
    "candidate.decision==='approved'",
    'candidate.reviewer===SYNTHETIC_REVIEWER_LABEL',
    'candidate.reportSnapshot===snapshot',
    "/^[a-f0-9]{64}$/.test(candidate.reportSha256||'')",
    'candidate.checklist.length===expectedChecklist.length',
    'item.checked===true && item.label===expectedChecklist[index].label',
    'approvedReviewMatches(report,out.textContent,reviewRecord)',
    'downloadButton.disabled=!exportEligible || !exportAck.checked || !approvedReview'
  ]) {
    assert.ok(script.includes(required), 'missing approval gate: ' + required);
  }
});

test('rejected, stale or changed review state cannot retain export approval', () => {
  for (const required of [
    "reviewDecision.addEventListener('change',()=>invalidateHumanReview())",
    "reviewNote.addEventListener('input',()=>invalidateHumanReview())",
    "reviewerName.addEventListener('input',()=>invalidateHumanReview())",
    "reviewChecklistItems.forEach(item=>item.addEventListener('change',()=>invalidateHumanReview(",
    'reviewRecord=null',
    'exportAck.checked=false'
  ]) {
    assert.ok(script.includes(required), 'missing review invalidation rule: ' + required);
  }
  assert.match(script, /candidate\.reportSnapshot===snapshot/);
});

test('the exported record states local-only review and untrusted device time', () => {
  for (const required of [
    'ثبت بازبینی انسانی (اظهار محلی؛ هویت احراز نشده)',
    'مبنای ساعت دستگاه؛ نمایش UTC؛ قابل راستی‌آزمایی مستقل نیست',
    'این اظهار محلی است و تأیید حقوقی یا احراز هویت محسوب نمی‌شود'
  ]) {
    assert.ok(script.includes(required), 'export must disclose: ' + required);
  }
});

test('successful export consumes the local approval and requires a fresh review', () => {
  const downloadHandler = script.slice(script.indexOf("document.getElementById('download').addEventListener('click',()=>{"));
  assert.ok(downloadHandler.length > 0, 'download handler must exist');
  for (const required of [
    'reviewRecord=null',
    'exportAck.checked=false',
    'reviewChecklistItems.forEach(item=>{item.checked=false;})',
    "reviewDecision.value='pending'",
    "reviewNote.value=''"
  ]) {
    assert.ok(downloadHandler.includes(required), 'export must consume approval: ' + required);
  }
});
