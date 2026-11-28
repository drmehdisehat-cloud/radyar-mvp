'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'dadyar-preview', 'index.html'), 'utf8');

test('offline preview must deny network connections and external scripts', () => {
  const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(csp, 'CSP meta required');
  for (const directive of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "frame-src 'none'"]) {
    assert.ok(csp[1].includes(directive), 'missing '+directive);
  }
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<form\b/i);
});
test('report export must require human review and invalidate stale drafts', () => {
  assert.match(html, /id="export-ack"/);
  assert.match(html, /id="download"\s+disabled/);
  assert.match(html, /downloadButton\.disabled\s*=\s*!exportEligible\s*\|\|\s*!exportAck\.checked/);
  assert.match(html, /function invalidateDraft\(\)/);
  assert.match(html, /exportEligible\s*=\s*false;\s*exportAck\.checked\s*=\s*false/);
  assert.match(html, /free-question'\)\.addEventListener\('input',invalidateDraft\)/);
});
