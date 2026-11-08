'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// CSS can initiate remote requests even when JavaScript network APIs are absent.
// This source-level guard complements CSP and the real Chromium network probe.
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(match => match[1]).join('\n');
const forbidden = [
  { name: 'CSS import', pattern: /@import\b/i },
  { name: 'CSS URL resource', pattern: /\burl\s*\(/i },
  { name: 'CSS image-set resource', pattern: /\b(?:-webkit-)?image-set\s*\(/i },
  { name: 'CSS font source', pattern: /@font-face\b/i }
];

test('offline preview CSS declares no resource-loading constructs', () => {
  assert.ok(css.length > 0, 'expected inline preview styles');
  for (const {name, pattern} of forbidden) {
    assert.doesNotMatch(css, pattern, name);
  }
});

test('CSS network-source guard rejects synthetic attack fixtures', () => {
  const fixtures = [
    '@import "https://example.invalid/collect.css";',
    'background: url(https://example.invalid/pixel);',
    'background: image-set("https://example.invalid/pixel" 1x);',
    '@font-face { font-family: demo; src: url(https://example.invalid/font); }'
  ];
  fixtures.forEach((fixture, index) => assert.match(fixture, forbidden[index].pattern));
});
