'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('offline cheque preview must not persist hypothetical questions in browser storage', () => {
  // Static fail-closed contract: reject storage sinks before any browser test.
  // This is not a substitute for a real Chromium/network/privacy review.
  assert.doesNotMatch(html, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/i);
  assert.doesNotMatch(html, /\bdocument\s*\.\s*cookie\b/i);
  assert.doesNotMatch(html, /\bnavigator\s*\.\s*serviceWorker\b/i);
});

test('offline cheque preview must not auto-submit or navigate user input', () => {
  assert.match(html, /form-action 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /\b(?:sendBeacon|fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
});
