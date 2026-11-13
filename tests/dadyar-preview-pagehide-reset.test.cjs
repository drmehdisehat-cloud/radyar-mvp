'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.indexOf('</script>', scriptStart);
const script = scriptStart >= 0 && scriptEnd > scriptStart
  ? html.slice(scriptStart + '<script>'.length, scriptEnd)
  : '';

test('free-question field disables browser autocomplete and pagehide reset is wired', () => {
  assert.match(html, /id="free-question"[^>]*autocomplete="off"/);
  assert.ok(script.includes("window.addEventListener('pagehide'"));
  assert.ok(script.includes("document.getElementById('free-question').value = ''"));
  assert.ok(script.includes('invalidateDraft();'));
  assert.doesNotMatch(html, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/i);
});

test('pagehide clears an unsubmitted free question and invalidates the local draft', () => {
  const start = script.indexOf("window.addEventListener('pagehide', () => {");
  assert.ok(start >= 0, 'pagehide listener must exist');
  const bodyStart = script.indexOf('{', start) + 1;
  const bodyEnd = script.indexOf('\n });', bodyStart);
  assert.ok(bodyEnd > bodyStart, 'pagehide listener body must close');
  const handlerBody = script.slice(bodyStart, bodyEnd);
  const field = { value: 'متن فرضی که هنوز ارسال نشده است' };
  let invalidated = false;
  const context = {
    document: {
      getElementById(id) {
        assert.equal(id, 'free-question');
        return field;
      }
    },
    invalidateDraft() {
      invalidated = true;
    }
  };
  vm.runInNewContext(handlerBody, context, { timeout: 1000 });
  assert.equal(field.value, '');
  assert.equal(invalidated, true);
});
