'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const scriptMatches = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const script = scriptMatches.length === 1 ? scriptMatches[0][2] : '';
const scriptTag = scriptMatches.length === 1 ? scriptMatches[0][0] : '';
const style = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] || '';
const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1] || '';

test('public preview remains a self-contained offline document', () => {
  assert.match(html, /<html lang="fa" dir="rtl">/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.equal(scriptMatches.length, 1, 'preview must have exactly one inline script');
  assert.doesNotMatch(scriptTag, /\bsrc\s*=/i, 'preview script must not load remote code');
  assert.doesNotMatch(
    html,
    /<(?:script|img|link|iframe|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*["']https?:\/\//i,
    'preview must not load remote resources'
  );
  assert.doesNotMatch(
    script,
    /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bserviceWorker\b|document\.cookie/i,
    'preview must not send requests or persist browser data'
  );
});

test('free-form Persian question stays local and routes through 27 topic hints', () => {
  const field = html.match(/<textarea\b[^>]*id="free-question"[^>]*>/i)?.[0] || '';
  assert.ok(field, 'free-form question field is required');
  assert.match(field, /maxlength="300"/);
  assert.match(field, /aria-describedby=/);
  assert.match(html, /طبقه‌بندی موضوعی فقط به‌صورت محلی و چندموضوعی انجام می‌شود/);

  const hints = script.match(/const topicHints\s*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(hints, 'topicHints array must remain explicit and reviewable');
  const ids = [...hints[1].matchAll(/"id"\s*:\s*"([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 27, 'exactly 27 internal topic hints are expected');
  assert.equal(new Set(ids).size, 27, 'topic hint IDs must be unique');
});

test('local report export requires a complete checklist and an approved matching report snapshot', () => {
  assert.match(script, /function reviewChecklistComplete\(\)\s*\{[\s\S]*?reviewChecklistItems\.length===4[\s\S]*?every\(item=>item\.checked===true\)/);
  assert.match(script, /approvedReview=Boolean\(reviewRecord && reviewRecord\.decision==='approved' && reviewRecord\.reportSnapshot===report[\s\S]*?reviewRecord\.checklist\.length===4[\s\S]*?every\(item=>item\.checked===true\)/);
  assert.match(script, /downloadButton\.disabled=!exportEligible \|\| !exportAck\.checked \|\| !approvedReview/);
  assert.match(script, /recordReviewButton\.disabled=[^;]*!reviewChecklistComplete\(\)[^;]*!exportAck\.checked/);
  assert.match(script, /reviewChecklistItems\.forEach\(item=>item\.addEventListener\('change',\(\)=>invalidateHumanReview/);
  assert.match(script, /if\(!reviewRecord \|\| reviewRecord\.reportSnapshot!==report\)return/);
  assert.match(script, /reviewRecord=null;[\s\S]*?exportAck\.checked=false/);
  assert.match(html, /هویت بازبین احراز نمی‌شود/);
  assert.match(html, /ثبت بازبینی در این صفحه محلی است/);
});
 
test('approved local review binds the exact report snapshot with Web Crypto SHA-256 before export', () => {
  assert.ok(script.includes('async function sha256Hex(value)'));
  assert.ok(script.includes("crypto.subtle.digest('SHA-256'"));
  assert.ok(script.includes('reviewDigestPending'));
  assert.ok(script.includes('reportSha256'));
  assert.ok(script.includes('reportSnapshot===report'));
  assert.ok(script.includes('SHA-256 پیش‌نویس بازبینی‌شده'));
  assert.ok(script.includes('secure_web_crypto_unavailable'));
  assert.ok(html.includes('اثر انگشت SHA-256'));
});

test('cheque-only preview excludes unrelated calculators and unverified owner-supplied index data', () => {
  assert.match(html, /کارگاه آزمایشی دادیار: چک فرضی/);
  assert.doesNotMatch(html, /delay-damages-calculator|delay-principal|delay-due-month|delay-payment-month|delay-calculate|delay-result|delay-index-list/i);
  assert.doesNotMatch(html, /محاسبه آزمایشی خسارت تأخیر تأدیه ۱۴۰۵/);
  assert.doesNotMatch(html, /data-indexes=/i);
  for (const value of ['2654.9','2880.4','3092.3','3205.1','3333.9','3452.1','3611.1']) assert.equal(html.includes(value), false, `unverified index ${value} must not ship in the cheque preview`);
});

test('inline CSP hashes exactly match the preview script and style bytes', () => {
  const scriptHash = csp.match(/script-src 'sha256-([^']+)'/)?.[1];
  const styleHash = csp.match(/style-src 'sha256-([^']+)'/)?.[1];
  assert.ok(scriptHash, 'script CSP hash is required');
  assert.ok(styleHash, 'style CSP hash is required');
  assert.equal(scriptHash, crypto.createHash('sha256').update(script, 'utf8').digest('base64'));
  assert.equal(styleHash, crypto.createHash('sha256').update(style, 'utf8').digest('base64'));
});

test('free-question generation delegates to the hardened shared privacy scanner', () => {
  const start = script.indexOf("document.getElementById('generate').addEventListener('click',()=>{");
  assert.ok(start >= 0, 'generate handler is required');
  const end = script.indexOf('\n});', start);
  assert.ok(end > start, 'generate handler boundary is required');
  const handler = script.slice(start, end);
  assert.match(handler, /const freeQuestionHasSensitiveIdentifier=hasSensitiveIdentifier\(freeQuestion\)/);
  assert.match(handler, /internalTopicMatches=freeQuestionHasSensitiveIdentifier\?\[\]:classifyQuestion\(freeQuestion\)/);
  assert.match(handler, /if\(freeQuestionHasSensitiveIdentifier\) conflicts\.push/);
  assert.doesNotMatch(handler, /normalizedQuestionDigits|compactIdentifierDigits|const hasSensitiveIdentifier=/);
});


test('downloaded report preserves the unauthenticated local-review disclaimer and untrusted device timestamp', () => {
  const start = script.indexOf("document.getElementById('download').addEventListener('click',()=>{");
  assert.ok(start >= 0, 'download handler is required');
  const end = script.indexOf("\\n});", start);
  assert.ok(end > start, 'download handler boundary is required');
  const handler = script.slice(start, end);

  assert.match(handler, /ثبت بازبینی انسانی \\(اظهار محلی؛ هویت احراز نشده\\)/);
  assert.match(handler, /مبنای ساعت دستگاه؛ نمایش UTC؛ قابل راستی‌آزمایی مستقل نیست/);
  assert.match(handler, /این اظهار محلی است و تأیید حقوقی یا احراز هویت محسوب نمی‌شود/);
  assert.match(handler, /reviewRecord\\.reportSnapshot!==report/);
  assert.match(handler, /reviewRecord=null/);
  assert.match(handler, /exportAck\\.checked=false/);
  assert.match(handler, /reviewChecklistItems\\.forEach/);
});
