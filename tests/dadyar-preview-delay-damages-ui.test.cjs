'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../dadyar-preview/data/delay-damages-index.json'), 'utf8'));
const section = html.match(/<section\\b[^>]*id="delay-damages-calculator"[^>]*>/)?.[0] || '';
const rawIndexes = section.match(/\\bdata-indexes='([^']+)'/)?.[1];
const start = html.indexOf('// BEGIN delay-damages calculator');
const end = html.indexOf('// END delay-damages calculator');
const browserBlock = start >= 0 && end > start ? html.slice(start, end + '// END delay-damages calculator'.length) : '';

function harness(indexes = rawIndexes, principal = '100000000') {
  const handlers = {};
  const elements = {};
  const make = (id, value = '') => (elements[id] = {
    id, value, textContent: '', children: [], disabled: false,
    dataset: {},
    append(item) { this.children.push(item); },
    addEventListener(name, fn) { handlers[id + ':' + name] = fn; }
  });
  const root = make('delay-damages-calculator');
  root.dataset.indexes = typeof indexes === 'string' ? indexes : JSON.stringify(indexes);
  // Default harness state mirrors the committed preview's unverified evidence.
  root.dataset.sourceStatus = 'transcribed-not-independently-authenticated';
  root.dataset.legalReviewStatus = 'not-reviewed';
  const due = make('delay-due-month');
  const paid = make('delay-payment-month');
  make('delay-principal', principal);
  make('delay-currency', 'ریال');
  make('delay-calculate');
  make('delay-result');
  make('delay-index-list');
  const document = {
    getElementById(id) { return elements[id] || null; },
    createElement(tagName) { return { tagName, value: '', textContent: '' }; }
  };
  vm.runInNewContext(browserBlock, { document }, { timeout: 5000 });
  return { elements, handlers, due, paid, root };
}

test('preview embeds exactly the seven owner-transcribed 1405 values and marks provenance', () => {
  assert.ok(section);
  assert.ok(rawIndexes);
  assert.deepEqual(JSON.parse(rawIndexes), data.months);
  assert.equal(data.months['5'], 3333.9);
  assert.equal(data.baseYear, 1395);
  assert.equal(data.source.status, 'transcribed-not-independently-authenticated');
  assert.equal(Object.keys(JSON.parse(rawIndexes)).length, 7);
});

test('browser calculator builds seven month choices and displays the index list while remaining disabled', () => {
  assert.ok(browserBlock);
  const h = harness();
  assert.equal(h.due.children.length, 7);
  assert.equal(h.paid.children.length, 7);
  assert.equal(h.elements['delay-index-list'].children.length, 7);
  assert.equal(h.paid.value, '7');
  assert.equal(h.elements['delay-calculate'].disabled, true);
  assert.match(h.elements['delay-result'].textContent, /محاسبه مسدود است/);
});

test('browser calculator cannot be unlocked by mutable provenance attributes or button-state edits', () => {
  const h = harness();
  const button = h.elements['delay-calculate'];
  assert.equal(button.disabled, true);
  h.root.dataset.sourceStatus = 'verified';
  h.root.dataset.legalReviewStatus = 'approved';
  button.disabled = false;
  h.handlers['delay-calculate:click']();
  assert.equal(button.disabled, true);
  assert.match(h.elements['delay-result'].textContent, /محاسبه مسدود است/);
});

test('browser calculator stays blocked with valid-looking inputs and contains no network/API code', () => {
  const h = harness();
  h.elements['delay-principal'].value = '100000000';
  h.due.value = '1';
  h.paid.value = '7';
  h.root.dataset.sourceStatus = 'verified';
  h.root.dataset.legalReviewStatus = 'approved';
  h.elements['delay-calculate'].disabled = false;
  h.handlers['delay-calculate:click']();
  assert.equal(h.elements['delay-calculate'].disabled, true);
  assert.match(h.elements['delay-result'].textContent, /محاسبه مسدود است/);
  assert.doesNotMatch(html, /\\bfetch\\s*\\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
});

test('browser calculator does not enable itself when a supplied index is invalid', () => {
  const h = harness({ "1": 0, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7 });
  assert.equal(h.elements['delay-calculate'].disabled, true);
  assert.match(h.elements['delay-result'].textContent, /داده شاخص نامعتبر است/);
});
