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
    script + '\nglobalThis.__classifyQuestion = classifyQuestion; globalThis.__isChequeScopeMatch = isChequeScopeMatch; globalThis.__topicHintCount = topicHints.length;',
    sandbox,
    { timeout: 1000 }
  );
  return { classify: sandbox.__classifyQuestion, isChequeScopeMatch: sandbox.__isChequeScopeMatch, count: sandbox.__topicHintCount };
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
test('cheque preview allows mixed free text when cheque is detected, but blocks non-cheque or unclassified questions', () => {
  const { classify, isChequeScopeMatch } = classifier();
  const expression = html.match(/const questionOutsideChequeScope=([^;]+);/)?.[1];
  assert.ok(expression, 'cheque-only scope gate missing');
  const outside = question => {
    const internalTopicMatches = classify(question);
    return vm.runInNewContext(expression, { freeQuestion: question, internalTopicMatches, isChequeScopeMatch });
  };
  assert.equal(outside(''), false, 'empty optional question keeps the synthetic cheque flow available');
  assert.equal(outside('چک صیادی و گواهی عدم پرداخت'), false, 'cheque-only question is in scope');
  assert.equal(outside('چک تضمینی و اجاره'), false, 'mixed cheque/property question keeps the cheque workshop available');
  assert.equal(outside('چک و طلاق'), false, 'mixed cheque/family question keeps the cheque workshop available');
  assert.equal(outside('چک و سفته'), false, 'mixed cheque/promissory-note question keeps the cheque workshop available for its cheque part');
  assert.equal(outside('سفته'), true, 'promissory-note-only question must be blocked');
  assert.equal(outside('برات'), true, 'bill-of-exchange-only question must be blocked');
  assert.equal(outside('ظهرنویسی'), true, 'generic endorsement-only question must be blocked');
  assert.equal(outside('اجاره'), true, 'non-cheque question must be blocked');
  assert.equal(outside('موضوع نامرتبط و بی‌کلیدواژه'), true, 'unclassified question must be blocked');
  assert.match(html, /پرسش آزاد چندموضوعی تشخیص داده شد؛ این پیش‌نمایش فقط سناریوی چک فرضی را پوشش می‌دهد و موضوع دیگر را تحلیل نمی‌کند/);
  assert.match(html, /if\(questionOutsideChequeScope\) conflicts\.push\(/);
});

test('free question accepts a general legal topic while the cheque-only preview scope remains explicit', () => {
  assert.match(html, /<label for="free-question">پرسش آزاد درباره موضوع حقوقی موردنظر/);
  assert.match(html, /id="free-question-scope-note" role="note"/);
  assert.match(html, /طبقه‌بندی موضوعی فقط به‌صورت محلی و چندموضوعی انجام می‌شود/);
  assert.match(html, /این پیش‌نمایش صرفاً بخش مربوط به چک فرضی را پوشش می‌دهد و سایر موضوعات را تحلیل نمی‌کند/);
  assert.match(html, /placeholder="در سناریوی چک تضمینی مرتبط با اجاره، چه مدارکی باید بررسی شود؟"/);
});

test('preview keeps keyboard focus visible on text, textarea and checkbox controls with a matching CSP style hash', () => {
  const crypto = require('node:crypto');
  const style = html.match(/<style>([\\s\\S]*?)<\\/style>/)?.[1];
  assert.ok(style, 'inline preview style missing');
  assert.match(style, /textarea:focus-visible/);
  assert.match(style, /input:not\\(\\[type=checkbox\\]\\):focus-visible/);
  assert.match(style, /input\\[type=checkbox\\]:focus-visible/);
  const digest = crypto.createHash('sha256').update(style, 'utf8').digest('base64');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, 'preview Content Security Policy missing');
  const styleSource = csp.match(/(?:^|;)\\s*style-src\\s+'sha256-([^']+)'/);
  assert.ok(styleSource, 'CSP must pin the inline style with a SHA-256 source');
  assert.equal(styleSource[1], digest, 'CSP style hash must match the exact inline CSS bytes');
});
