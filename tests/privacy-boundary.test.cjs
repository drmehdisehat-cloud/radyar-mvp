'use strict';
// Synthetic privacy regression guard for the experimental, opt-in local API.
// Static checks only: this does not replace a real browser or security audit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('app.js');
const report = read('export.js');
const html = read('index.html');
const client = read('api-validation.js');
for (const [name, source] of [['app.js', app], ['export.js', report]]) {
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/, name + ': persistent case data');
  assert.doesNotMatch(source, /\binnerHTML\s*=/, name + ': unsafe HTML sink');
}
assert.match(app, /function clearCase\(\)\s*\{\s*state\s*=\s*null\s*;/);
assert.match(app, /addEventListener\('pagehide',\s*clearCase\)/);
// Clear on every pageshow: ordinary reload can restore form values too.
assert.match(app, /addEventListener\('pageshow',\s*clearCase\)/);
assert.match(report, /\.textContent\s*=/);
assert.match(report, /if\s*\(!confirm\(/);
// A same-origin connection is needed for the explicit localhost-only API.
// Reject arbitrary hosts, wildcard origins and protocols in the CSP.
assert.match(html, /default-src\s+'none'/);
assert.match(html, /connect-src\s+'self'\s*;/);
assert.doesNotMatch(html, /connect-src\s+[^;]*(?:https?:|\*)/i);
// The client must never enable remote validation or send without consent.
assert.match(client, /location\.protocol === 'http:'/);
assert.match(client, /\['127\.0\.0\.1', 'localhost', '\[::1\]'\]\.includes\(location\.hostname\)/);
assert.match(client, /if\s*\(!confirm\(/);
assert.match(client, /credentials:\s*'omit'/);
assert.match(client, /cache:\s*'no-store'/);
console.log('PASS: synthetic privacy boundary for explicit local API (not a live browser audit)');
