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
  assert.doesNotMatch(html, /دسته‌بندی داخلی:|برچسب‌های موضوعی پیشنهادی/);
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

test('free text is classified locally then removed before it can enter the report', () => {
  assert.match(html, /internalTopicMatches=hasSensitiveIdentifier\?\[\]:classifyQuestion\(freeQuestion\)/);
  assert.match(html, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
  assert.match(html, /freeQuestionField\.value='';/);
  assert.doesNotMatch(html, /:freeQuestion;/);
  assert.doesNotMatch(html, /برچسب‌های موضوعی پیشنهادی/);
});

test('free-text routing collapses repeated whitespace and line breaks without losing multi-topic matches', () => {
  const { classify } = classifier();
  const spaced = Array.from(classify('چک   تضمینی\nاجاره'), item => item.id);
  assert.ok(spaced.includes('instruments'));
  assert.ok(spaced.includes('property'));
  const halfSpace = Array.from(classify('جرم\u200cرایانه\u200cای و فیشینگ'), item => item.id);
  assert.ok(halfSpace.includes('digital'));
});

test('single-word hints do not match as substrings inside unrelated words', () => {
  const { classify } = classifier();
  const ids = Array.from(classify('چکمه چرمی و ارزاق روزانه'), item => item.id);
  assert.ok(!ids.includes('instruments'));
  assert.ok(!ids.includes('finance'));
});
test('cheque-only preview blocks multi-topic questions even when cheque is one detected domain', () => {
  const { classify } = classifier();
  const expression = html.match(/const questionOutsideChequeScope=([^;]+);/)?.[1];
  assert.ok(expression, 'cheque-only scope gate missing');
  const outside = question => {
    const internalTopicMatches = classify(question);
    return vm.runInNewContext(expression, { freeQuestion: question, internalTopicMatches });
  };
  assert.equal(outside(''), false, 'empty optional question keeps the synthetic cheque flow available');
  assert.equal(outside('چک صیادی و گواهی عدم پرداخت'), false, 'cheque-only question is in scope');
  assert.equal(outside('چک تضمینی و اجاره'), true, 'mixed cheque/property question must be blocked');
  assert.equal(outside('چک و طلاق'), true, 'mixed cheque/family question must be blocked');
  assert.equal(outside('اجاره'), true, 'non-cheque question must be blocked');
  assert.equal(outside('موضوع نامرتبط و بی‌کلیدواژه'), true, 'unclassified question must be blocked');
  assert.match(html, /if\(questionOutsideChequeScope\) conflicts\.push\(/);
});
