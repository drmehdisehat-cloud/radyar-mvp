'use strict';
// Synthetic-only regression: browsers can restore form fields on ordinary reload,
// not just BFCache navigation. No case data should survive either pageshow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('pageshow clears sensitive interview fields on reload and BFCache restore', () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '', textContent: '', style: { display: '' }, disabled: false,
        replaceChildren() { this.children = []; },
      });
    }
    return elements.get(id);
  };
  const listeners = {};
  const context = vm.createContext({
    document: { getElementById: get },
    window: { addEventListener(name, fn) { listeners[name] = fn; } },
    flows: { theft: { title: 'موضوع ساختگی' } },
    roleQuestions: { theft: { 'شاهد': 'سؤال شاهد' } },
    questionsFor() { return ['سؤال ۱', 'سؤال ۲', 'سؤال ۳', 'سؤال ۴', 'سؤال ۵']; },
    alert() { throw new Error('Unexpected intake validation failure'); },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'),
    context, { timeout: 1000 });
  assert.equal(typeof listeners.pageshow, 'function');
  assert.equal(typeof listeners.pagehide, 'function');

  // A normal reload may restore form values even when in-memory state is new.
  get('story').value = 'متن خصوصی ساختگی بازگردانده‌شده توسط مرورگر';
  get('answer').value = 'پاسخ خصوصی ساختگی';
  listeners.pageshow({ persisted: false });
  assert.equal(get('story').value, '');
  assert.equal(get('answer').value, '');

  // A BFCache restoration must also discard an interview in progress.
  get('topic').value = 'theft';
  get('role').value = 'شاهد';
  get('story').value = 'شرح پرونده ساختگی برای آزمون حریم خصوصی';
  get('start').onclick();
  assert.equal(vm.runInContext('state !== null', context), true);
  get('answer').value = 'پاسخ ساختگی';
  listeners.pageshow({ persisted: true });
  assert.equal(vm.runInContext('state === null', context), true);
  assert.equal(get('story').value, '');
  assert.equal(get('answer').value, '');
  assert.equal(get('startBox').style.display, 'block');
  assert.equal(get('questionBox').style.display, 'none');
  assert.equal(get('results').style.display, 'none');

  // Leaving the page remains a separate privacy boundary.
  get('story').value = 'داده ساختگی موقت';
  listeners.pagehide({});
  assert.equal(get('story').value, '');
});
