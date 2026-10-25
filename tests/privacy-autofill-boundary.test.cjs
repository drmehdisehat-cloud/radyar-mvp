'use strict';
// Browser autofill suppression is best-effort only. This test checks the
// markup and disclosure, not browser/OS persistence or privacy certification.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('sensitive interview textareas discourage browser and OS suggestions', () => {
  for (const id of ['story', 'answer']) {
    const tag = html.match(new RegExp('<textarea\\b[^>]*\\bid="' + id + '"[^>]*>', 'i'))?.[0];
    assert.ok(tag, 'missing textarea: ' + id);
    for (const attribute of ['autocomplete="off"', 'autocorrect="off"',
      'autocapitalize="off"', 'spellcheck="false"']) {
      assert.ok(tag.includes(attribute), id + ' missing ' + attribute);
    }
  }
});

test('privacy notice does not promise browser or OS data erasure', () => {
  assert.match(html, /مرورگر یا سیستم‌عامل ممکن است ورودی‌های قبلی/);
  assert.match(html, /از دستگاه مشترک استفاده نکنید/);
});
