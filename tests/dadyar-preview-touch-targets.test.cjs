'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('offline cheque preview exposes a responsive viewport and 44px touch targets', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(html, /button,select\{[^}]*min-height:44px/);
  assert.match(html, /button,select\{[^}]*max-width:100%/);
  assert.match(html, /input\[type=checkbox\]\{[^}]*min-width:22px;min-height:22px/);
  assert.match(html, /button:focus-visible,select:focus-visible\{outline:3px/);
});


test('delay-damages calculator controls remain usable on narrow touch screens', () => {
  assert.match(html, /#delay-principal\\{min-height:44px\\}/);
  assert.match(html, /#delay-due-month,#delay-payment-month,#delay-currency\\{width:100%\\}/);
  assert.match(html, /#delay-calculate\\{width:100%\\}/);
  assert.match(html, /id="delay-damages-calculator"/);
  assert.match(html, /id="delay-calculate"/);
});
