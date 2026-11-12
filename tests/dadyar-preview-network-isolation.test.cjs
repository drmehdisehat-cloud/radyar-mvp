'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const executable = scriptTags.map(match => match[2]).join('\n');

const forbiddenNetworkPatterns = [
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
const forbiddenStoragePatterns = [
  /\blocalStorage\b/i,
  /\bsessionStorage\b/i,
  /\bindexedDB\b/i,
  /\bdocument\s*\.\s*cookie\b/i,
  /\bcaches\s*\.\s*open\b/i
];

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
  for (const pattern of forbiddenNetworkPatterns) {
    assert.doesNotMatch(executable, pattern, 'forbidden network-capable API found: ' + pattern);
  }
});

test('network guard detects every forbidden API in a synthetic probe', () => {
  const fixture = [
    'fetch("/synthetic")',
    'new XMLHttpRequest()',
    'new WebSocket("wss://example.invalid")',
    'new EventSource("/events")',
    'navigator.sendBeacon("/beacon", "synthetic")',
    'importScripts("/worker.js")',
    'new WebTransport("https://example.invalid")',
    'new SharedWorker("/shared.js")',
    'navigator.serviceWorker.register("/sw.js")'
  ].join('; ');
  for (const pattern of forbiddenNetworkPatterns) {
    assert.match(fixture, pattern, 'detector failed to recognize forbidden API: ' + pattern);
  }
});

test('offline preview does not persist questions or review data in browser storage', () => {
  for (const pattern of forbiddenStoragePatterns) {
    assert.doesNotMatch(executable, pattern, 'persistent browser storage found: ' + pattern);
  }
});

test('storage guard detects every forbidden browser storage surface in a synthetic probe', () => {
  const fixture = [
    'localStorage.setItem("q", "synthetic")',
    'sessionStorage.setItem("r", "synthetic")',
    'indexedDB.open("synthetic")',
    'document.cookie = "synthetic=1"',
    'caches.open("synthetic")'
  ].join('; ');
  for (const pattern of forbiddenStoragePatterns) {
    assert.match(fixture, pattern, 'detector failed to recognize browser storage API: ' + pattern);
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

const styleTags = [...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)];
const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1] || '';
const cspDirectives = Object.fromEntries(csp.split(';').map(part => {
  const [name, ...values] = part.trim().split(/\s+/);
  return [name, values];
}));
function cspHash(source) {
  return 'sha256-' + crypto.createHash('sha256').update(source).digest('base64');
}

test('CSP pins the exact inline script and style bytes', () => {
  assert.equal(scriptTags.length, 1);
  assert.equal(styleTags.length, 1);
  assert.deepEqual(cspDirectives['script-src'], [cspHash(scriptTags[0][2])]);
  assert.deepEqual(cspDirectives['style-src'], [cspHash(styleTags[0][2])]);
  assert.deepEqual(cspDirectives['default-src'], ["'none'"]);
  assert.deepEqual(cspDirectives['connect-src'], ["'none'"]);
  assert.deepEqual(cspDirectives['form-action'], ["'none'"]);
  assert.deepEqual(cspDirectives['base-uri'], ["'none'"]);
  for (const directive of ['img-src', 'font-src', 'object-src', 'frame-src']) {
    assert.deepEqual(cspDirectives[directive], ["'none'"]);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:/i);
});

test('offline preview has no remote navigation, form target, or refresh escape hatch', () => {
  assert.doesNotMatch(html, /<(?:script|link|iframe|img|audio|video|source|track|object|embed)\b[^>]*\b(?:src|href|data)\s*=\s*["']?\s*(?:https?:|\/\/)/i);
  assert.doesNotMatch(html, /\b(?:action|formaction|poster)\s*=\s*["']?\s*(?:https?:|\/\/)/i);
  assert.doesNotMatch(html, /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i);
  assert.doesNotMatch(html, /@import\s|url\(\s*["']?\s*(?:https?:|\/\/)/i);
  assert.doesNotMatch(executable, /\bwindow\s*\.\s*open\s*\(|\blocation\s*\.\s*(?:assign|replace)\s*\(|\bdocument\s*\.\s*location\b/i);
});

test('offline preview keeps the human-review limitation visible in the page', () => {
  assert.match(html, /بازبینی محلی توسط انسان/);
  assert.match(html, /هویت یا سمت بازبین احراز نمی‌شود/);
  assert.match(html, /ثبت اظهار محلی بازبین/);
  assert.match(html, /id="download" disabled/);
});
