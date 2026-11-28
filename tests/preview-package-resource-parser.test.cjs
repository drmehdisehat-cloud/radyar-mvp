'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSelfContainedHtml } = require('../scripts/build-offline-preview-package.cjs');

test('rejects HTML resource attributes after a greater-than sign inside a quoted attribute', () => {
  assert.throws(
    () => assertSelfContainedHtml('<img alt=">" src="https://example.invalid/pixel.png">'),
    /resource references are not allowed/
  );
});

test('rejects SVG external href after a greater-than sign inside a quoted attribute', () => {
  assert.throws(
    () => assertSelfContainedHtml('<svg><image aria-label=">" href="https://example.invalid/pixel.svg"></image></svg>'),
    /external SVG references are not allowed/
  );
});

test('rejects meta refresh attributes after a greater-than sign inside a quoted attribute', () => {
  assert.throws(
    () => assertSelfContainedHtml('<meta name="note" content=">" http-equiv="refresh" content="0;url=https://example.invalid/">'),
    /meta refresh/
  );
});

test('fails closed on an unterminated quoted resource tag', () => {
  assert.throws(
    () => assertSelfContainedHtml('<img alt="unterminated src="https://example.invalid/pixel.png">'),
    /malformed resource tag/
  );
});

test('allows same-document SVG fragments even when an earlier attribute contains a greater-than sign', () => {
  assert.doesNotThrow(() => assertSelfContainedHtml(
    '<svg><symbol id="icon"></symbol><use aria-label=">" href="#icon"></use></svg>'
  ));
});

test('allows a self-contained document without resource references', () => {
  assert.doesNotThrow(() => assertSelfContainedHtml(
    '<!doctype html><html><head><style>body{color:black}</style></head><body><script>const n = 2 < 3;</script><p>آزمایش</p></body></html>'
  ));
});
