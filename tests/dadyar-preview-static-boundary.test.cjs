'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('offline preview is statically isolated from network and form submission', () => {
  const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
  assert.ok(csp, 'preview CSP meta tag missing');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.doesNotMatch(html, /<form\b/i, 'offline preview must not submit forms');
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=/i,
    'offline preview must not load external scripts or stylesheets');

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1, 'expected one reviewed inline script');
  const script = scripts[0][1];
  assert.doesNotMatch(script,
    /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\s*\(|\bimportScripts\s*\(/,
    'offline preview must not contain browser network primitives');
});

test('offline preview labels local review as unauthenticated and keeps free text out of the report', () => {
  assert.match(html, /هویت بازبین در این نسخه آفلاین احراز نمی‌شود/);
  assert.match(html, /بدون احراز هویت/);
  assert.match(html, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
  assert.match(html, /id="free-question"[^>]*autocomplete="off"/);
});

test('offline preview exposes a free-text field and keeps topic routing internal', () => {
  assert.match(html, /id="free-question"/);
  assert.match(html, /function classifyQuestion\(/);
  assert.match(html, /const topicHints\s*=\s*\[/);
  assert.doesNotMatch(html, /<select[^>]+(?:topic|موضوع)/i);
});
