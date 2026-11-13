'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness(response) {
  const handlers = {};
  const requests = [];
  const elements = Object.fromEntries(['send','clear','consent','message','access','status','log'].map(id => [id, {
    value: '', checked: false, disabled: false, textContent: '',
    addEventListener(event, fn) { handlers[id + ':' + event] = fn; },
    replaceChildren() {}, append() {}
  }]));
  elements.consent.checked = true;
  elements.access.value = 'a'.repeat(43);
  elements.message.value = 'در سناریوی کاملاً ساختگی چک و اجاره چه مدارکی لازم است؟';
  const context = {
    document: { getElementById: id => elements[id], createElement: () => ({ textContent: '' }) },
    window: { addEventListener() {} },
    AbortController,
    fetch: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return response;
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../chat.js'), 'utf8'), context);
  return { handlers, elements, requests };
}

test('private chat sends free text unchanged without requiring or locking a topic selector', async () => {
  const h = harness({ ok: true, json: async () => ({ answer: 'پاسخ آزمایشی؛ نیازمند بازبینی' }) });
  const raw = h.elements.message.value;
  await h.handlers['send:click']();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, '/api/chat');
  assert.equal(h.requests[0].body.messages[0].content, raw);
  assert.equal(Object.hasOwn(h.requests[0].body, 'topic'), false);
  assert.equal(h.elements.message.value, '');
  h.handlers['clear:click']();
  assert.equal(h.elements.access.value, '');
  assert.equal(h.elements.consent.checked, false);
});

test('failed free-text reply does not persist the question or require a category lock', async () => {
  const h = harness({ ok: false, status: 503, json: async () => ({ error: 'ai_not_configured' }) });
  const raw = h.elements.message.value;
  await h.handlers['send:click']();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].body.messages[0].content, raw);
  assert.equal(h.elements.message.value, raw);
  assert.match(h.elements.status.textContent, /پیکربندی نشده/);
  assert.equal(h.elements.send.disabled, false);
});
