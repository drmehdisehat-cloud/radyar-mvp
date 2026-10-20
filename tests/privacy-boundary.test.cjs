'use strict';
// Synthetic privacy regression guard for the experimental browser-only intake.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('app.js');
const report = read('export.js');
const html = read('index.html');
for (const [name, source] of [['app.js', app], ['export.js', report]]) {
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/, name + ': persistent case data');
  assert.doesNotMatch(source, /\binnerHTML\s*=/, name + ': unsafe HTML sink');
}
assert.match(app, /function clearCase\(\)\s*\{\s*state\s*=\s*null\s*;/);
assert.match(app, /addEventListener\('pagehide',\s*clearCase\)/);
assert.match(app, /event\.persisted\)\s*clearCase\(\)/);
assert.match(report, /\.textContent\s*=/);
assert.match(report, /if\s*\(!confirm\(/);
assert.match(html, /connect-src\s+'none'/);
console.log('PASS: static privacy regression (not a live browser audit)');
