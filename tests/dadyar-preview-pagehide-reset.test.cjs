'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1];

test('free-question field disables browser autocomplete and pagehide reset is wired', () => {
  assert.match(html, /id="free-question"[^>]*autocomplete="off"/);
  assert.match(script, /window\\.addEventListener\\('pagehide'/);
  assert.match(script, /document\\.getElementById\\('free-question'\\)\\.value = ''/);
  assert.match(script, /invalidateDraft\\(\\)/);
  assert.doesNotMatch(html, /\\b(?:localStorage|sessionStorage|indexedDB|caches)\\b/i);
});

test('pagehide clears an unsubmitted free question and invalidates the local draft', () => {
  const handler = script.match(/window\\.addEventListener\\('pagehide',\\s*\\(\\)\\s*=>\\s*\\{([\\s\\S]*?)\\}\\);/)?.[1];
  assert.ok(handler, 'pagehide handler body must exist');
  const field = { value: 'متن فرضی که هنوز ارسال نشده است' };
  let invalidated = false;
  const context = {
    document: { getElementById(id) { assert.equal(id, 'free-question'); return field; } },
    invalidateDraft() { invalidated = true; }
  };
  vm.runInNewContext(handler, context, { timeout: 1000 });
  assert.equal(field.value, '');
  assert.equal(invalidated, true);
});
