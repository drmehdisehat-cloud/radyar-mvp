'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const executable = scriptTags.map(match => match[2]).join('\n');

test('offline preview has exactly one self-contained inline script', () => {
  assert.equal(scriptTags.length, 1, 'preview must contain exactly one inline script');
  assert.doesNotMatch(scriptTags[0][1], /\bsrc\s*=/i, 'inline script must not have a remote src');
  assert.doesNotMatch(
    html,
    /<(?:link|iframe|img|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i,
    'preview must not load external subresources'
  );
  assert.doesNotMatch(html, /@import\s+url\s*\(/i, 'preview must not import remote stylesheets');
});

test('offline preview blocks browser network APIs in executable code', () => {
  assert.ok(executable.length > 0, 'the inline application script must be inspected');
  const forbidden = [
    /\bfetch\s*\(/i,
    /\bXMLHttpRequest\b/i,
    /\bWebSocket\b/i,
    /\bEventSource\b/i,
    /\bsendBeacon\b/i,
    /\bimportScripts\s*\(/i,
    /\bWebTransport\b/i,
    /\bSharedWorker\b/i,
    /\bserviceWorker\b/i
  ];
  for (const pattern of forbidden) {
    assert.doesNotMatch(executable, pattern, 'forbidden network-capable API found: ' + pattern);
  }
});

test('offline preview does not persist questions or review data in browser storage', () => {
  const forbidden = [
    /\blocalStorage\b/i,
    /\bsessionStorage\b/i,
    /\bindexedDB\b/i,
    /\bdocument\s*\.\s*cookie\b/i,
    /\bcaches\s*\.\s*open\b/i
  ];
  for (const pattern of forbidden) {
    assert.doesNotMatch(executable, pattern, 'persistent browser storage found: ' + pattern);
  }
});

test('offline preview keeps a deny-by-default CSP and disables connections and forms', () => {
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.doesNotMatch(html, /<form\b/i, 'offline preview must not submit forms');
});

test('offline preview retains explicit privacy and no-index metadata', () => {
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(html, /اطلاعات واقعی وارد نکنید/);
});
