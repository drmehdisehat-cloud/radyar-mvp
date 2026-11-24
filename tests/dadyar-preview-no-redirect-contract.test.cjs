'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A static offline preview must not navigate or import remote resources
// before the runtime network-call probe is installed.
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const externalCss = /@import\s+(?:url\s*\(\s*)?['"]?\s*(?:https?:|\/\/)/i;
const metaRefresh = /<meta\b[^>]*http-equiv\s*=\s*['"]?refresh\b/i;
const remoteCssUrl = /url\s*\(\s*['"]?\s*(?:https?:|\/\/)/i;
const remoteNavigation = /(?:window\.)?location\s*(?:=|\.assign\s*\(|\.replace\s*\()/i;

test('offline preview has no automatic navigation or CSS remote imports', () => {
  assert.doesNotMatch(html, metaRefresh);
  assert.doesNotMatch(html, externalCss);
  assert.doesNotMatch(html, remoteCssUrl);
  assert.doesNotMatch(html, remoteNavigation);
});
test('offline guards detect representative hostile fixtures', () => {
  assert.match('<meta http-equiv="refresh" content="0;url=https://example.invalid">', metaRefresh);
  assert.match('@import url("https://example.invalid/a.css")', externalCss);
  assert.match('background:url(//example.invalid/pixel)', remoteCssUrl);
  assert.match('window.location.assign("https://example.invalid")', remoteNavigation);
});
