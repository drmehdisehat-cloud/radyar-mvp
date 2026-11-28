'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1];

assert.ok(script, 'offline preview browser logic must be present');

test('every case-defining input invalidates the previous draft and its review', () => {
  const listeners = [
    "role.addEventListener('change',invalidateDraft);",
    "for(const answer of document.querySelectorAll('#interview select')) answer.addEventListener('change',invalidateDraft);",
    "document.getElementById('free-question').addEventListener('input',invalidateDraft);",
    "eventDateField.addEventListener('input',invalidateDraft);",
    "for(const checkbox of document.querySelectorAll('#evidence-list input[type=\\"checkbox\\"]')) checkbox.addEventListener('change',invalidateDraft);"
  ];
  for (const listener of listeners) {
    assert.ok(script.includes(listener), 'case input is not wired to draft invalidation: ' + listener);
  }
});

test('draft invalidation clears the report, eligibility, checklist and prior reviewer decision', () => {
  const start = script.indexOf('function invalidateDraft(){');
  assert.ok(start >= 0, 'invalidateDraft must exist');
  const end = script.indexOf('\\n}', start);
  assert.ok(end > start, 'invalidateDraft function boundary must exist');
  const handler = script.slice(start, end + 2);
  for (const required of [
    'const hadDraft=Boolean(report);',
    'const hadReview=Boolean(reviewRecord);',
    "report='';",
    'out.textContent=\'\';',
    'reviewRecord=null;',
    'reviewChecklistItems.forEach(item=>{item.checked=false;});',
    "reviewDecision.value='pending';",
    'box.hidden=true;',
    'exportEligible=false;',
    'exportAck.checked=false;',
    'if(focusWasInDraft) document.getElementById(\'generate\').focus();'
  ]) {
    assert.ok(handler.includes(required), 'invalidation must clear stale state: ' + required);
  }
});

test('a user receives an accessible explanation when editing invalidates an existing draft', () => {
  assert.match(html, /id="reset-status" role="status" aria-live="polite"/);
  assert.match(script, /resetStatus\\.textContent=\\(hadDraft\\|\\|hadReview\\)[\\s\\S]*?اطلاعات سناریو تغییر کرد؛ پیش‌نویس قبلی و تأیید بازبینی پاک شد/);
  assert.match(script, /برای دریافت گزارش تازه، دوباره پیش‌نویس را بسازید/);
});
