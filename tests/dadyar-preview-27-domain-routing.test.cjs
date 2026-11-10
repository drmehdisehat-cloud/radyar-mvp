'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function classifier() {
  assert.ok(script, 'inline preview script missing');
  const elements = new Map();
  const element = () => ({
    value: '', textContent: '', hidden: false, disabled: false, checked: false,
    selectedIndex: 0, options: [], style: {},
    addEventListener() {}, focus() {}, contains() { return false; }
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement: element
  };
  const sandbox = { document, URL: {}, Blob: class {}, setTimeout() {} };
  vm.runInNewContext(
    script + '\nglobalThis.__classifyQuestion = classifyQuestion; globalThis.__topicHintCount = topicHints.length;',
    sandbox,
    { timeout: 1000 }
  );
  return { classify: sandbox.__classifyQuestion, count: sandbox.__topicHintCount };
}

test('free-text router loads all 27 internal legal-domain hints without a topic menu', () => {
  const { count } = classifier();
  assert.equal(count, 27);
  assert.match(html, /id="free-question"/);
  assert.doesNotMatch(html, /<select[^>]+(?:topic|موضوع)/i);
  assert.doesNotMatch(html, /برچسب‌های موضوعی پیشنهادی/);
  assert.match(html, /دسته‌بندی داخلی: چندموضوعی و غیرقطعی/);
});

test('all 27 taxonomy domains are discoverable from representative synthetic keywords', () => {
  const { classify } = classifier();
  const probes = [
    ['civil','قرارداد'], ['property','اجاره'], ['registry','سند رسمی'],
    ['family','ازدواج'], ['succession','ارث'], ['liability','مسئولیت مدنی'],
    ['civil-procedure','دادخواست'], ['enforcement','اجراییه'], ['criminal','سرقت'],
    ['criminal-procedure','شکواییه'], ['special-crimes','مواد مخدر'],
    ['digital','فیشینگ'], ['commercial','شرکت تجاری'], ['instruments','چک'],
    ['labor','قرارداد کار'], ['administrative','دیوان عدالت اداری'],
    ['municipal','شهرداری'], ['tax','مالیات'], ['finance','بانک'],
    ['consumer','حقوق مصرف کننده'], ['ip','ثبت برند'], ['public-law','قانون اساسی'],
    ['international','تابعیت'], ['health','قصور پزشکی'], ['environment','آلودگی'],
    ['transport','بارنامه'], ['cross-cutting','وقف']
  ];
  for (const [expected, phrase] of probes) {
    const ids = Array.from(classify(phrase), item => item.id);
    assert.ok(ids.includes(expected), 'domain not detected: ' + expected + ' from ' + phrase);
  }
});

test('free text can map one question to multiple internal domains', () => {
  const { classify } = classifier();
  const ids = Array.from(classify('چک تضمینی اجاره'), item => item.id);
  assert.ok(ids.includes('instruments'));
  assert.ok(ids.includes('property'));
  assert.equal(classify('موضوع نامرتبط و بی‌کلیدواژه').length, 0);
});

test('Arabic Yeh and Kaf variants normalize before matching Persian legal hints', () => {
  const { classify } = classifier();
  const ids = Array.from(classify('چك صیادی و جرم رايانه ای'), item => item.id);
  assert.ok(ids.includes('instruments'));
  assert.ok(ids.includes('digital'));
});

test('sensitive free text is not exposed through the generated report copy', () => {
  assert.match(html, /internalTopicMatches=hasSensitiveIdentifier\?\[\]:classifyQuestion\(freeQuestion\)/);
  assert.doesNotMatch(html, /برچسب‌های موضوعی پیشنهادی/);
  assert.match(html, /if\(hasSensitiveIdentifier\) document\.getElementById\('free-question'\)\.value='';/);
});
