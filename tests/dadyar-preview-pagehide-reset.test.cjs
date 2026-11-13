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
const helperMatch = script.match(/function clearInterviewState\(\)\s*\{([\s\S]*?)\n\}/);
const pagehideMatch = script.match(/window\.addEventListener\('pagehide', \(\) => \{([\s\S]*?)\n \}\);/);

test('free-question field disables autocomplete and pagehide is wired to the shared full reset', () => {
  assert.match(html, /id="free-question"[^>]*autocomplete="off"/);
  assert.ok(pagehideMatch, 'pagehide listener must exist');
  assert.ok(helperMatch, 'shared interview reset helper must exist');
  assert.ok(script.includes("document.getElementById('free-question').value = ''"));
  assert.ok(helperMatch[1].includes('role.selectedIndex=0'));
  assert.ok(helperMatch[1].includes("querySelectorAll('#interview select')"));
  assert.ok(helperMatch[1].includes("querySelectorAll('fieldset input[type=checkbox]')"));
  assert.ok(helperMatch[1].includes('invalidateDraft();'));
  assert.doesNotMatch(html, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/i);
});

test('pagehide clears free text, role, interview answers and selected evidence, then invalidates the draft', () => {
  assert.ok(helperMatch, 'clearInterviewState helper must exist');
  assert.ok(pagehideMatch, 'pagehide listener must exist');
  const role = { selectedIndex: 4 };
  const field = { value: 'متن فرضی که هنوز ارسال نشده است' };
  const selects = [{ selectedIndex: 2 }, { selectedIndex: 1 }, { selectedIndex: 2 }];
  const checkboxes = [{ checked: true }, { checked: true }, { checked: false }, { checked: true }];
  let invalidated = false;
  const context = {
    role,
    document: {
      getElementById(id) {
        assert.equal(id, 'free-question');
        return field;
      },
      querySelectorAll(selector) {
        if (selector === '#interview select') return selects;
        if (selector === 'fieldset input[type=checkbox]') return checkboxes;
        throw new Error('Unexpected selector: ' + selector);
      }
    },
    invalidateDraft() { invalidated = true; }
  };
  const executable = 'function clearInterviewState(){' + helperMatch[1] + '\n}\n' + pagehideMatch[1];
  vm.runInNewContext(executable, context, { timeout: 1000 });
  assert.equal(field.value, '');
  assert.equal(role.selectedIndex, 0);
  assert.ok(selects.every(control => control.selectedIndex === 0));
  assert.ok(checkboxes.every(control => control.checked === false));
  assert.equal(invalidated, true);
});
