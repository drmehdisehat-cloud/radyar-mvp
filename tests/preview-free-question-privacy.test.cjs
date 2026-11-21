'use strict';
// Best-effort input privacy controls for the offline preview only.
// These attributes do not guarantee that a browser or OS forgets prior input.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dadyar-preview', 'index.html'), 'utf8');

test('free legal question discourages autofill, autocorrection, capitalization and spellcheck', () => {
  const tag = html.match(/<textarea\\b[^>]*\\bid="free-question"[^>]*>/i)?.[0];
  assert.ok(tag, 'missing free-question textarea in the actual public preview');
  for (const attribute of [
    'autocomplete="off"',
    'autocorrect="off"',
    'autocapitalize="off"',
    'spellcheck="false"'
  ]) {
    assert.ok(tag.includes(attribute), 'free-question missing ' + attribute);
  }
});
