'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('offline cheque preview rejects CSS imports, external embeds and redirects', () => {
  assert.doesNotMatch(html, /@import\b/i);
  assert.doesNotMatch(html, /<(?:iframe|object|embed|audio|video|source)\b/i);
  assert.doesNotMatch(html, /<meta[^>]+http-equiv\s*=\s*["']?refresh/i);
  assert.doesNotMatch(html, /\burl\s*\(/i);
  assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon\s*\(/i);
  assert.match(html, /connect-src 'none'/);
});
