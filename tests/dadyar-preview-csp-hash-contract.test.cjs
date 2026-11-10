'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];

function cspHash(source) {
  return crypto.createHash('sha256').update(source, 'utf8').digest('base64');
}

test('offline preview authorizes only the exact inline script and stylesheet hashes', () => {
  assert.ok(style, 'inline stylesheet missing');
  assert.ok(script, 'inline application script missing');
  assert.ok(csp, 'CSP meta policy missing');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.ok(csp.includes("script-src 'sha256-" + cspHash(script) + "'"), 'script hash does not match exact inline bytes');
  assert.ok(csp.includes("style-src 'sha256-" + cspHash(style) + "'"), 'style hash does not match exact inline bytes');
  assert.doesNotMatch(csp, /'unsafe-inline'/);
});

test('offline preview has no inline style attributes or remote execution escape hatch', () => {
  assert.doesNotMatch(html, /<[a-z][^>]*\sstyle\s*=/i);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\bhref\s*=\s*['"]?\s*(?:https?:|\/\/)/i);
  assert.doesNotMatch(csp, /(?:connect-src|form-action)\s+[^;]*(?:https?:|\*|data:)/i);
});
