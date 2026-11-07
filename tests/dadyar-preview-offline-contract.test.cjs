'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const remoteResource = /<(?:script|link|iframe|img|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*['"]?\s*(?:https?:|\/\/)/i;
const networkApi = /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\s*\(/;
const remoteForm = /<form\b[^>]*\baction\s*=\s*['"]?\s*(?:https?:|\/\/)/i;

test('offline preview has fail-closed CSP and no declared remote resources', () => {
  for (const directive of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
    assert.ok(html.includes(directive), 'missing CSP directive: '+directive);
  }
  assert.doesNotMatch(html, remoteResource);
  assert.doesNotMatch(html, remoteForm);
  assert.doesNotMatch(html, networkApi);
});

test('offline preview export requires fresh human acknowledgement and invalidates on changes', () => {
  assert.match(html, /downloadButton\.disabled=!exportEligible \|\| !exportAck\.checked/);
  assert.match(html, /function invalidateDraft\(\)/);
  assert.match(html, /exportAck\.checked=false;updateExportPermission\(\)/);
  assert.match(html, /role\.addEventListener\('change',invalidateDraft\)/);
  assert.match(html, /#interview select/);
  assert.match(html, /fieldset input\[type=checkbox\]/);
  assert.match(html, /conflicts\.length===0 && unresolved\.length===0/);
});

test('offline checks reject representative regressions', () => {
  assert.match('<script src="https://example.invalid/x.js">', remoteResource);
  assert.match('<img src="//example.invalid/x.png">', remoteResource);
  assert.match('<form action="https://example.invalid/collect">', remoteForm);
  assert.match('fetch("/api")', networkApi);
  assert.match('sendBeacon("/api")', networkApi);
  assert.match('WebSocket("/socket")', networkApi);
});
