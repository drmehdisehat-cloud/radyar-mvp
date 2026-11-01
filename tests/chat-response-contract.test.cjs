'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../chat.js'), 'utf8');
function harness(answer) {
  const elements = new Map();
  for (const id of ['log','send','consent','message','access','status','topic','clear']) {
    elements.set(id, {
      value: '', checked: false, disabled: false, textContent: '',
      handlers: {}, children: [],
      addEventListener(type, cb) { this.handlers[type] = cb; },
      replaceChildren() { this.children = []; },
      append(node) { this.children.push(node); }
    });
  }
  elements.get('consent').checked = true;
  elements.get('message').value = 'سناریوی ساختگی';
  elements.get('access').value = Buffer.alloc(32, 7).toString('base64url');
  elements.get('topic').value = 'چک';
  const context = {
    document: {
      getElementById: id => elements.get(id),
      createElement: () => ({textContent: ''})
    },
    window: {addEventListener() {}},
    AbortController,
    fetch: async () => ({ok:true, json:async()=>answer})
  };
  vm.runInNewContext(source, context, {filename:'chat.js'});
  return elements;
}
for (const invalid of [null, {}, {answer:null}, {answer:''}, {answer:'   '}, {answer:42}, {answer:'x'.repeat(16001)}]) {
  test('malformed provider answer cannot enter the visible transcript', async () => {
    const els = harness(invalid);
    await els.get('send').handlers.click();
    assert.equal(els.get('log').children.length, 0);
    assert.match(els.get('status').textContent, /پاسخ معتبر/);
    assert.equal(els.get('message').value, 'سناریوی ساختگی');
    assert.equal(els.get('send').disabled, false);
  });
}
test('valid synthetic answer renders only after validation', async () => {
  const els = harness({answer:'پاسخ آزمایشی'});
  await els.get('send').handlers.click();
  assert.equal(els.get('log').children.length, 2);
  assert.match(els.get('log').children[1].textContent, /پاسخ آزمایشی/);
});
