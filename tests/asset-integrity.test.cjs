'use strict';
// Static build guard: a missing or stale HTML script reference breaks the MVP.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /<html\b[^>]*\blang="fa"[^>]*\bdir="rtl"/i, 'Persian RTL root required');
const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
assert.ok(csp, 'CSP meta tag is required');
assert.match(csp[1], /default-src 'none'/, 'default CSP must deny by default');
assert.match(csp[1], /script-src 'self'/, 'only same-origin scripts allowed');
assert.match(csp[1], /connect-src 'self'/, 'only same-origin API requests allowed');
const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
const names = scripts.map(([, attributes]) => {
  const match = attributes.match(/\bsrc="([^"]+)"/i);
  assert.ok(match, 'inline scripts are forbidden');
  assert.match(match[1], /^[\w-]+\.js$/, 'no remote or nested scripts');
  assert.ok(fs.statSync(path.join(root, match[1])).isFile(), 'missing asset: ' + match[1]);
  return match[1];
});
assert.deepEqual(names, ['flows.js', 'app.js', 'export.js', 'api-validation.js'], 'frontend script load order must match modules');
console.log('PASS: RTL, CSP, four frontend scripts in dependency order');
