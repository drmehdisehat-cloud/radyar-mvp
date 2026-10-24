'use strict';
// Deterministic DOM-harness journey test; NOT a real browser or legal-accuracy test.
// All inputs are synthetic. No case data is persisted or transmitted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scripts = ['flows.js', 'app.js', 'export.js']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const topics = ['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh'];
const roles = ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد'];

function boot() {
  const nodes = new Map();
  const listeners = new Map();
  const alerts = [];
  function element(id) {
    return {
      id, value: '', textContent: '', disabled: false, style: { display: '' },
      children: [], onclick: null,
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = [...items]; },
      remove() {},
    };
  }
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, element(id));
    return nodes.get(id);
  };
  const document = { getElementById: get, createElement: element };
  const window = { addEventListener(type, callback) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(callback);
  }};
  const ctx = vm.createContext({
    document, window, console,
    alert: message => alerts.push(message),
    confirm: () => false,
  });
  vm.runInContext(scripts, ctx, { timeout: 2000 });
  return {
    get, ctx, alerts,
    fire(type, event = {}) {
      for (const callback of listeners.get(type) || []) callback(event);
    },
    state() { return JSON.parse(vm.runInContext('JSON.stringify(state)', ctx)); },
    report() { return vm.runInContext('report()', ctx); },
  };
}

for (const topic of topics) for (const role of roles) {
  test('synthetic interview journey: ' + topic + ' / ' + role, () => {
    const app = boot();
    const get = app.get;
    get('topic').value = topic;
    get('role').value = role;
    get('story').value = 'شرح ساختگی پرونده با نیم‌فاصله برای آزمون جریان مصاحبه';
    get('start').onclick();
    assert.equal(get('questionBox').style.display, 'block');
    assert.equal(get('back').disabled, true);
    assert.match(get('qProgress').textContent, /۱ از ۵/);

    get('answer').value = 'پاسخ نخست ساختگی';
    get('next').onclick();
    assert.equal(get('back').disabled, false);
    get('back').onclick();
    assert.equal(get('answer').value, 'پاسخ نخست ساختگی');
    get('next').onclick();
    get('skip').onclick();
    for (let i = 2; i < 5; i++) {
      get('answer').value = 'پاسخ ساختگی ' + (i + 1);
      get('next').onclick();
    }
    assert.equal(get('results').style.display, 'block');
    assert.equal(app.state().answers.length, 5);
    assert.equal(app.state().answers[1], 'نامشخص');
    assert.equal(get('summary').children.length, 9,
      'topic, story, five answers, unresolved questions, and documents');
    const report = app.report();
    assert.match(report, /گزارش آزمایشی دادیار/);
    assert.match(report, /اطلاعات تکمیل‌نشده/);
    assert.match(report, /صحت آن‌ها بررسی نشده است/);
    assert.doesNotMatch(report, /اعتبار حقوقی تأیید شده است/);
    get('reset').onclick();
    assert.equal(app.state(), null);
    assert.equal(get('story').value, '');
    assert.equal(get('summary').children.length, 0);
    assert.equal(get('startBox').style.display, 'block');
  });
}

test('invalid intake is rejected; pagehide and BFCache restoration erase the case', () => {
  const app = boot(), get = app.get;
  get('topic').value = 'theft';
  get('role').value = 'شاهد';
  get('story').value = '!';
  get('start').onclick();
  assert.equal(app.state(), null);
  assert.equal(app.alerts.length, 1);
  get('story').value = 'شرح آزمایشی معتبر برای بررسی پاک‌سازی';
  get('start').onclick();
  assert.ok(app.state());
  app.fire('pagehide');
  assert.equal(app.state(), null);
  get('start').onclick();
  assert.equal(app.state(), null, 'pagehide cleared the story field');
  get('story').value = 'شرح آزمایشی معتبر برای بازگشت مرورگر';
  get('start').onclick();
  assert.ok(app.state());
  app.fire('pageshow', { persisted: true });
  assert.equal(app.state(), null);
  assert.equal(get('story').value, '');
});
