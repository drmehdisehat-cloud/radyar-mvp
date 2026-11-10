'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('synthetic export asks for explicit human self-review without implying legal certification', () => {
  const label = html.match(/<label>\s*<input[^>]*id="export-ack"[^>]*>([^<]+)<\/label>/);
  assert.ok(label, 'human-review acknowledgement label missing');
  assert.match(label[1], /شخصاً.*بازبینی کرده‌ام/);
  assert.match(label[1], /به معنای تأیید قانونی.*نیست/);
  assert.match(html, /هویت بازبین احراز نمی‌شود/);
  assert.match(html, /جایگزین تأیید بازبین مستقل نیست/);
  assert.match(html, /exportEligible\s*\|\|\s*!exportAck\.checked/);
  assert.match(html, /exportAck\.checked=false;updateExportPermission\(\)/);
});


test('suspected personal identifiers are cleared from the editable offline question field', () => {
  assert.match(html, /if\(hasSensitiveIdentifier\) document\.getElementById\('free-question'\)\.value='';/);
  assert.match(html, /const displayQuestion=hasSensitiveIdentifier\?'نامشخص؛ شناسه حساس احتمالی شناسایی شد و متن ورودی حذف شد':freeQuestion/);
  assert.match(html, /if\(hasSensitiveIdentifier\) conflicts\.push\(/);
});
