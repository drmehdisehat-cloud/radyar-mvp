'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

function inlineBlock(tag) {
  const matches = [...html.matchAll(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'gi'))];
  assert.equal(matches.length, 1, 'preview must contain exactly one inline ' + tag + ' block');
  return matches[0][1];
}
function sha256Base64(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('base64');
}
function cspDirectives() {
  const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*>/i);
  assert.ok(match, 'strict Content-Security-Policy meta tag is required');
  return new Map(match[1].split(';').map(part => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values.join(' ')];
  }));
}

test('offline preview pins the exact inline CSS and JavaScript bytes in CSP', () => {
  const directives = cspDirectives();
  const styleHash = sha256Base64(inlineBlock('style'));
  const scriptHash = sha256Base64(inlineBlock('script'));
  assert.equal(directives.get('style-src'), "'sha256-" + styleHash + "'");
  assert.equal(directives.get('script-src'), "'sha256-" + scriptHash + "'");
  assert.doesNotMatch([...directives.values()].join(' '), /unsafe-inline|unsafe-eval/i);
});

test('offline preview denies network, forms, frames, plugins and external assets by default', () => {
  const directives = cspDirectives();
  for (const name of [
    'default-src', 'connect-src', 'img-src', 'font-src', 'object-src',
    'frame-src', 'media-src', 'manifest-src', 'worker-src', 'child-src',
    'form-action', 'base-uri'
  ]) {
    assert.equal(directives.get(name), "'none'", 'CSP directive must deny ' + name);
  }
  assert.equal(directives.has('prefetch-src'), false, 'unsupported prefetch-src directive must be omitted; default-src none remains the fallback');
  assert.doesNotMatch(
    html,
    /<(?:script|link|iframe|img|audio|video|source|object|embed|track)\b[^>]*\b(?:src|href)\s*=\s*["']?\s*(?:https?:|\/\/|\/)/i,
    'preview must not load external or root-relative resources'
  );
  assert.doesNotMatch(html, /<(?:form|iframe|object|embed)\b/i);
});

test('preview source contains no network client or browser persistence primitive', () => {
  for (const pattern of [
    /\bfetch\s*\(/i,
    /\bXMLHttpRequest\b/i,
    /\bWebSocket\b/i,
    /\bEventSource\b/i,
    /\bnavigator\s*\.\s*sendBeacon\b/i,
    /\bnavigator\s*\.\s*serviceWorker\b/i,
    /\b(?:localStorage|sessionStorage|indexedDB|CacheStorage)\b/i,
    /\bdocument\s*\.\s*cookie\b/i,
    /\bcaches\s*\.\s*(?:open|match|delete)\s*\(/i
  ]) {
    assert.doesNotMatch(html, pattern, 'offline preview must not use ' + pattern);
  }
});

test('free-text question is transient, locally classified, omitted from report and cleared on pagehide', () => {
  assert.match(html, /id="free-question"[^>]*maxlength="300"/);
  assert.match(html, /freeQuestionField\.value='';/);
  assert.match(html, /internalTopicMatches=hasSensitiveIdentifier\?\[\]:classifyQuestion\(freeQuestion\)/);
  assert.match(html, /const displayQuestion=hasSensitiveIdentifier/);
  assert.match(html, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
  assert.match(html, /پرسش آزاد کاربر درباره داده ساختگی: '\+\(displayQuestion/);
  assert.match(html, /freeQuestion='';/);
  assert.match(html, /window\.addEventListener\('pagehide'/);
  assert.match(html, /clearInterviewState\(\);/);
});

test('human-review notes and decisions are in-memory only and clearly unauthenticated', () => {
  assert.match(html, /بازبینی محلی توسط انسان \(بدون احراز هویت\)/);
  assert.match(html, /هویت یا سمت بازبین احراز نمی‌شود/);
  assert.match(html, /reviewRecord=\{/);
  assert.match(html, /reviewRecord=null/);
  assert.match(html, /reviewNote\.value=''/);
  assert.match(html, /downloadButton\.disabled=!exportEligible \|\| !exportAck\.checked \|\| !approvedReview/);
  assert.match(html, /reviewRecord=null;\s*exportAck\.checked=false;/);
});
