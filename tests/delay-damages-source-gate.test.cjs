'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../dadyar-preview/index.html'), 'utf8');
const section = html.match(/<section\\b[^>]*id="delay-damages-calculator"[^>]*>/)?.[0] || '';
const script = html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1] || '';
const calculator = script.match(/\\/\\/ BEGIN delay-damages calculator([\\s\\S]*?)\\/\\/ END delay-damages calculator/)?.[1] || '';

test('delay-damages preview remains fail-closed while source and human legal review are unverified', () => {
  assert.ok(section, 'delay calculator section missing');
  assert.match(section, /data-source-status="transcribed-not-independently-authenticated"/);
  assert.match(section, /data-legal-review-status="not-reviewed"/);
  assert.ok(calculator, 'calculator script block missing');
  assert.match(calculator, /root\\.dataset\\?\\.sourceStatus === 'verified'/);
  assert.match(calculator, /root\\.dataset\\?\\.legalReviewStatus === 'approved'/);
  assert.match(calculator, /if \\(!sourceReleaseAllowed\\(\\)\\)/);
  assert.match(calculator, /calculateButton\\.disabled = true/);
  assert.match(calculator, /محاسبه مسدود است/);
  assert.doesNotMatch(calculator, /\\bfetch\\s*\\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
});
