'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const scriptMatches = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const script = scriptMatches.length === 1 ? scriptMatches[0][2] : '';
const scriptTag = scriptMatches.length === 1 ? scriptMatches[0][0] : '';
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
