'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dadyar-preview/index.html'), 'utf8');
const index = JSON.parse(fs.readFileSync(path.join(root, 'dadyar-preview/data/delay-damages-index.json'), 'utf8'));

test('embedded preview index exactly matches the reviewed source JSON', () => {
  const match = html.match(/data-indexes='([^']+)'/);
  assert.ok(match, 'inline index data attribute missing');
  assert.deepEqual(JSON.parse(match[1]), index.months);
  assert.equal(index.schema, 'dadyar-delay-damages-index-v2');
  assert.equal(index.seriesType, 'monthly-index-points');
  assert.equal(index.source.status, 'transcribed-not-independently-authenticated');
});

test('only the seven transcribed months are available; later months remain blocked', () => {
  assert.deepEqual(Object.keys(index.months).sort(), ['1','2','3','4','5','6','7']);
  assert.deepEqual(index.unavailableMonths, [8,9,10,11,12]);
  assert.match(html, /فقط ماه‌های فروردین تا مهر ۱۴۰۵/);
  assert.match(html, /تأیید رسمی و حقوقی نشده است/);
});

test('the preview stays network-isolated and does not invoke a remote API', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(csp, 'CSP meta tag missing');
  assert.match(csp[1], /connect-src 'none'/);
  assert.match(csp[1], /form-action 'none'/);
  assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|new WebSocket\s*\(/);
});
