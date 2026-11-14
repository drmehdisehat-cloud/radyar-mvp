'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../dadyar-preview/data/delay-damages-index.json'), 'utf8'));
const section = html.match(/<section\b[^>]*id="delay-damages-calculator"[^>]*>/)?.[0] || '';
const rawIndexes = section.match(/\bdata-indexes='([^']+)'/)?.[1];
const start = html.indexOf('// BEGIN delay-damages calculator');
const end = html.indexOf('// END delay-damages calculator');
const browserBlock = start >= 0 && end > start ? html.slice(start, end + '// END delay-damages calculator'.length) : '';

function harness(indexes = rawIndexes, principal = '100000000') {
  const handlers = {};
  const elements = {};
  const make = (id, value = '') => (elements[id] = {
    id, value, textContent: '', children: [],
    dataset: {},
    append(item) { this.children.push(item); },
    addEventListener(name, fn) { handlers[id + ':' + name] = fn; }
  });
  const root = make('delay-damages-calculator');
  root.dataset.indexes = typeof indexes === 'string' ? indexes : JSON.stringify(indexes);
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
  vm.runInNewContext(browserBlock, { document }, { timeout: 1000 });
  return { elements, handlers, due, paid };
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

test('browser calculator builds seven month choices and displays the index list', () => {
  assert.ok(browserBlock);
  const h = harness();
  assert.equal(h.due.children.length, 7);
  assert.equal(h.paid.children.length, 7);
  assert.equal(h.elements['delay-index-list'].children.length, 7);
  assert.equal(h.paid.value, '7');
});

test('browser calculator computes the 100,000,000 rial Farvardin-to-Mehr example', () => {
  const h = harness();
  h.handlers['delay-calculate:click']();
  const result = h.elements['delay-result'].textContent;
  assert.match(result, /۱۳۶٬۰۱۶٬۴۲۲ ریال/);
  assert.match(result, /۳۶٬۰۱۶٬۴۲۲ ریال/);
  assert.match(result, /تأیید رسمی و حقوقی نشده است/);
});

test('browser calculator rejects a payment month before the legal-origin month', () => {
  const h = harness();
  h.due.value = '7';
  h.paid.value = '1';
  h.handlers['delay-calculate:click']();
  assert.match(h.elements['delay-result'].textContent, /نباید پیش از ماه مبدأ باشد/);
});

test('browser calculator rejects invalid principal and has no network/API code', () => {
  const h = harness();
  h.elements['delay-principal'].value = '0';
  h.handlers['delay-calculate:click']();
  assert.match(h.elements['delay-result'].textContent, /اصل دین باید عدد صحیح مثبت/);
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
});

test('browser calculator preserves exact rounding when the intermediate product exceeds safe Number precision', () => {
  const h = harness({ "1": 1000, "2": 110.867, "3": 110.867, "4": 110.867, "5": 110.867, "6": 110.867, "7": 110.867 }, '9007199254740991');
  h.due.value = '1';
  h.paid.value = '2';
  h.handlers['delay-calculate:click']();
  const expected = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(998601159775369);
  assert.ok(h.elements['delay-result'].textContent.includes(expected), 'large-principal result lost exact integer rounding');
});

test('browser calculator fails closed when a source index is zero or non-positive', () => {
  const h = harness({ "1": 0, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7 });
  assert.match(h.elements['delay-result'].textContent, /داده شاخص نامعتبر است/);
});
