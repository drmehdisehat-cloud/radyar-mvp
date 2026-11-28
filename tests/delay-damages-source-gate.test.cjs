'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../dadyar-preview/index.html'), 'utf8');
const section = html.split('<section id="delay-damages-calculator"')[1]?.split('>')[0] || '';
const script = html.split('<script>')[1]?.split('</script>')[0] || '';
const start = script.indexOf('// BEGIN delay-damages calculator');
const end = script.indexOf('// END delay-damages calculator');
const calculator = start >= 0 && end > start ? script.slice(start, end) : '';

test('delay-damages preview remains fail-closed while source and human legal review are unverified', () => {
  assert.ok(section, 'delay calculator section missing');
  assert.ok(section.includes('data-source-status="transcribed-not-independently-authenticated"'));
  assert.ok(section.includes('data-legal-review-status="not-reviewed"'));
  assert.ok(calculator, 'calculator script block missing');
  assert.ok(calculator.includes('officialSourceVerified: false'));
  assert.ok(calculator.includes('independentLegalReviewApproved: false'));
  assert.ok(calculator.includes('SOURCE_APPROVALS.officialSourceVerified === true'));
  assert.ok(calculator.includes('SOURCE_APPROVALS.independentLegalReviewApproved === true'));
  assert.equal(calculator.includes("root.dataset?.sourceStatus === 'verified'"), false);
  assert.equal(calculator.includes("root.dataset?.legalReviewStatus === 'approved'"), false);
  assert.ok(calculator.includes('if (!sourceReleaseAllowed())'));
  assert.ok(calculator.includes('calculateButton.disabled = true'));
  assert.ok(calculator.includes('محاسبه مسدود است'));
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon']) {
    assert.equal(calculator.includes(forbidden), false, 'unexpected network primitive: ' + forbidden);
  }
});
