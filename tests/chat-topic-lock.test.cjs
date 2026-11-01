'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('legal topic locks after successful reply and unlocks on reset', async () => {
  const handlers = {};
  const elements = Object.fromEntries(['send','clear','consent','message','access','topic','status','log'].map(id => [id, {
    value: '', checked: false, disabled: false, textContent: '',
    addEventListener(event, fn) { handlers[id + ':' + event] = fn; },
    replaceChildren() {}, append() {}
  }]));
  elements.consent.checked = true;
  elements.access.value = 'a'.repeat(43);
  elements.message.value = 'سناریوی فرضی چک';
  elements.topic.value = 'چک';
  const context = {
    document: { getElementById: id => elements[id], createElement: () => ({ textContent: '' }) },
    window: { addEventListener() {} },
    AbortController,
    fetch: async () => ({ ok: true, json: async () => ({ answer: 'پاسخ آزمایشی؛ نیازمند بازبینی' }) })
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../chat.js'), 'utf8'), context);
  await handlers['send:click']();
  assert.equal(elements.topic.disabled, true);
  handlers['clear:click']();
  assert.equal(elements.topic.disabled, false);
  assert.equal(elements.access.value, '');
  assert.equal(elements.consent.checked, false);
});

test('failed reply does not lock the topic', async () => {
  const handlers = {};
  const elements = Object.fromEntries(['send','clear','consent','message','access','topic','status','log'].map(id => [id, {
    value: '', checked: false, disabled: false, textContent: '',
    addEventListener(event, fn) { handlers[id + ':' + event] = fn; },
    replaceChildren() {}, append() {}
  }]));
  elements.consent.checked = true;
  elements.access.value = 'a'.repeat(43);
  elements.message.value = 'پرونده ساختگی';
  elements.topic.value = 'مهریه';
  const context = {
    document: { getElementById: id => elements[id], createElement: () => ({ textContent: '' }) },
    window: { addEventListener() {} },
    AbortController,
    fetch: async () => ({ ok: false, status: 503, json: async () => ({ error: 'ai_not_configured' }) })
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../chat.js'), 'utf8'), context);
  await handlers['send:click']();
  assert.equal(elements.topic.disabled, false);
});
