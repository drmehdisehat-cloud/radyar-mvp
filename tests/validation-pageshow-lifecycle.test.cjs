'use strict';
// Synthetic-only lifecycle regression: no real case text or network requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('all pageshow events abort pending localhost validation and clear stale feedback', () => {
  const events = new Map();
  const elements = new Map();
  function get(id) {
    if (!elements.has(id)) {
      const listeners = new Map();
      elements.set(id, {
        disabled: id === 'validateLocal',
        textContent: '',
        addEventListener(type, handler) { listeners.set(type, handler); },
        trigger(type) {
          assert.ok(listeners.has(type), id + ' missing ' + type);
          return listeners.get(type)();
        },
      });
    }
    return elements.get(id);
  }
  let signal;
  let requests = 0;
  const ctx = vm.createContext({
    document: { getElementById: get },
    window: { addEventListener(type, handler) { events.set(type, handler); } },
    location: { protocol: 'http:', hostname: '127.0.0.1' },
    state: {
      topic: 'theft', role: 'شاهد',
      story: 'شرح ساختگی و بدون اطلاعات موکل',
      answers: Array(5).fill('پاسخ فرضی'),
    },
    questionsFor: () => Array(5).fill('سؤال فرضی'),
    confirm: () => true,
    fetch: (_url, options) => {
      requests++;
      signal = options.signal;
      return new Promise(() => {}); // Deliberately stalled synthetic request.
    },
    AbortController, setTimeout, clearTimeout,
  });
  const source = fs.readFileSync(path.join(__dirname, '../api-validation.js'), 'utf8');
  vm.runInContext(source, ctx, { timeout: 1000 });
  const button = get('validateLocal');
  const status = get('validationStatus');
  assert.equal(button.disabled, false, 'localhost-only validation is available');
  assert.equal(typeof events.get('pageshow'), 'function');

  for (const persisted of [false, true]) {
    button.trigger('click');
    assert.equal(button.disabled, true);
    assert.match(status.textContent, /در حال بررسی/);
    assert.equal(signal.aborted, false);
    events.get('pageshow')({ persisted });
    assert.equal(signal.aborted, true, 'pending request must be aborted');
    assert.equal(button.disabled, false, 'validation button must be reusable');
    assert.equal(status.textContent, 'اعتبارسنجی انجام نشده است.',
      'stale case status must not survive a restored page');
  }
  assert.equal(requests, 2, 'only explicit, confirmed synthetic requests are sent');
});
