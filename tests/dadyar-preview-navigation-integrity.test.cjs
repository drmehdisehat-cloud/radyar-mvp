'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
function audit(document) {
  const policies = [...document.matchAll(/<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi)];
  assert.equal(policies.length, 1, 'preview must have exactly one CSP meta');
  const policy = policies[0][0];
  for (const rule of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
    assert.ok(policy.includes(rule), 'CSP missing '+rule);
  }
  assert.doesNotMatch(document, /<meta\b[^>]*http-equiv\s*=\s*["']refresh["']/i);
  assert.doesNotMatch(document, /<base\b/i);
  assert.doesNotMatch(document, /\b(?:location\.(?:href|assign|replace)|window\.open)\s*(?:=|\()/i);
}
test('preview keeps a single restrictive CSP and no navigation escape hatches', () => audit(html));
test('navigation/CSP guard catches representative malicious changes', () => {
  for (const mutated of [
    html.replace('</head>', '<meta http-equiv="refresh" content="0;url=https://example.invalid"></head>'),
    html.replace('</head>', '<base href="https://example.invalid/"></head>'),
    html.replace('</head>', '<meta http-equiv="Content-Security-Policy" content="default-src *"></head>'),
    html.replace('</script>', 'window.open("https://example.invalid");</script>')
  ]) assert.throws(() => audit(mutated));
});
