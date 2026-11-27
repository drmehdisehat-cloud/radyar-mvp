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
    script + '\nglobalThis.__classifyQuestion = classifyQuestion; globalThis.__isChequeScopeMatch = isChequeScopeMatch; globalThis.__isChequeOnlyScope = isChequeOnlyScope; globalThis.__topicHintCount = topicHints.length; globalThis.__hasSensitiveIdentifier = hasSensitiveIdentifier;',
    sandbox,
    { timeout: 1000 }
  );
  return { classify: sandbox.__classifyQuestion, isChequeScopeMatch: sandbox.__isChequeScopeMatch, isChequeOnlyScope: sandbox.__isChequeOnlyScope, hasSensitiveIdentifier: sandbox.__hasSensitiveIdentifier, count: sandbox.__topicHintCount };
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
    ['civil','قرارداد'], ['civil','خسارت تأخیر تأدیه'], ['civil','خسارت تاخیر تادیه'],
    ['civil-procedure','ماده ۵۲۲'], ['civil-procedure','ماده 522'], ['civil-procedure','آیین دادرسی مدنی'],
    ['property','اجاره'], ['registry','سند رسمی'],
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

test('Persian, Arabic-Indic and ASCII Article 522 variants route identically', () => {
  const { classify } = classifier();
  const variants = ['ماده ۵۲۲', 'ماده ٥٢٢', 'ماده 522'];
  const routed = variants.map(classify);
  for (const result of routed) {
    assert.ok(result.some(item => item.id === 'civil-procedure'));
  }
  assert.deepEqual(routed[1], routed[0]);
  assert.deepEqual(routed[2], routed[0]);
});

test('delay-damages free text routes to civil law and Article 522 to civil procedure', () => {
  const { classify } = classifier();
  const delay = Array.from(classify('خسارت تأخیر تأدیه چک'), item => item.id);
  assert.ok(delay.includes('civil'), 'delay-damages phrase must map to civil domain');
  assert.ok(delay.includes('instruments'), 'cheque part must remain independently discoverable');
  for (const phrase of ['ماده ۵۲۲', 'ماده 522', 'آیین دادرسی مدنی']) {
    assert.ok(Array.from(classify(phrase), item => item.id).includes('civil-procedure'),
      'procedure hint missing for ' + phrase);
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
  assert.match(html, /const freeQuestionHasSensitiveIdentifier=hasSensitiveIdentifier\(freeQuestion\)/);
  assert.match(html, /internalTopicMatches=freeQuestionHasSensitiveIdentifier\?\[\]:classifyQuestion\(freeQuestion\)/);
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
test('cheque preview accepts only cheque-only free text; mixed-topic questions are classified but blocked', () => {
  const { classify, isChequeScopeMatch, isChequeOnlyScope } = classifier();
  const expression = html.match(/const questionOutsideChequeScope=([^;]+);/)?.[1];
  assert.ok(expression, 'cheque-only scope gate missing');
  const outside = question => {
    const internalTopicMatches = classify(question);
    return vm.runInNewContext(expression, { freeQuestion: question, internalTopicMatches, isChequeOnlyScope });
  };
  assert.equal(outside(''), false, 'empty optional question keeps the synthetic cheque flow available');
  assert.equal(outside('چک صیادی و گواهی عدم پرداخت'), false, 'cheque-only question is in scope');

  const mixedCases = [
    ['چک تضمینی و اجاره', ['instruments', 'property']],
    ['چک و طلاق', ['instruments', 'family']],
    ['چک و سفته', ['instruments']],
    ['چک و ماده ٥٢٢', ['instruments', 'civil-procedure']],
    ['چک و خسارت تأخیر تأدیه', ['instruments', 'civil']]
  ];
  for (const [question, expectedDomains] of mixedCases) {
    const matches = classify(question);
    const ids = matches.map(item => item.id);
    assert.ok(matches.some(isChequeScopeMatch), 'cheque hint must remain discoverable for ' + question);
    for (const id of expectedDomains) assert.ok(ids.includes(id), 'missing internal domain ' + id + ' for ' + question);
    assert.equal(isChequeOnlyScope(matches), false, 'mixed or non-cheque keywords must not be treated as cheque-only');
    assert.equal(outside(question), true, 'mixed-topic question must not produce a cheque-only report: ' + question);
  }

  for (const question of ['سفته', 'برات', 'ظهرنویسی', 'اجاره', 'موضوع نامرتبط و بی‌کلیدواژه']) {
    assert.equal(outside(question), true, 'non-cheque or unclassified question must be blocked: ' + question);
  }
  assert.match(html, /پرسش آزاد چندموضوعی تشخیص داده شد؛ این پیش‌نمایش فقط سناریوی چک فرضی را پوشش می‌دهد و موضوع دیگر را تحلیل نمی‌کند/);
  assert.match(html, /فقط پرسش تک‌حوزه‌ای چک را می‌پذیرد/);
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
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(style, 'inline preview style missing');
  assert.match(style, /textarea:focus-visible/);
  assert.match(style, /input:not\(\[type=checkbox\]\):focus-visible/);
  assert.match(style, /input\[type=checkbox\]:focus-visible/);
  const digest = crypto.createHash('sha256').update(style, 'utf8').digest('base64');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, 'preview Content Security Policy missing');
  const styleSource = csp.match(/(?:^|;)\s*style-src\s+'sha256-([^']+)'/);
  assert.ok(styleSource, 'CSP must pin the inline style with a SHA-256 source');
  assert.equal(styleSource[1], digest, 'CSP style hash must match the exact inline CSS bytes');
});

test('privacy scanner removes Unicode default-ignorable code points before matching identifiers', () => {
  const { hasSensitiveIdentifier } = classifier();
  const invisible = codePoint => String.fromCodePoint(codePoint);
  const probes = [
    'شماره همراه: ۰۹۱۲' + invisible(0x2062) + '۳۴۵۶۷۸۹',
    'کد ملی: ۱۲۳۴۵' + invisible(0x2063) + '۶۷۸۹۰',
    'شماره کارت: ۶۰۳۷' + invisible(0x2064) + '۹۹۱۷' + invisible(0x2061) + '۴۵۶۲۱۶۸',
    'شبا: IR' + invisible(0x2062) + '۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴'
  ];
  for (const probe of probes) {
    assert.equal(hasSensitiveIdentifier(probe), true, 'obfuscated sensitive identifier was not detected: '+probe);
  }
  assert.equal(hasSensitiveIdentifier('پرسش ساختگی درباره چک تضمینی و اجاره'), false);
});


test('privacy scanner blocks mixed-script and Unicode-obfuscated contact details', () => {
  const { hasSensitiveIdentifier } = classifier();
  const probes = [
    'شماره همراه: ۰۹۱۲-٣٤٥٦٧٨٩',
    'کد ملی: ۱۲۳۴-۵۶۷-۸۹۰',
    'ایمیل: mehdi' + String.fromCodePoint(0x2062) + '.sehat@example.com',
    'پیوند: https://mehdisehat' + String.fromCodePoint(0x2062) + '.ir/test',
    'نشانی: خیابان آزادی پلاک ۱۲'
  ];
  for (const probe of probes) {
    assert.equal(
      hasSensitiveIdentifier(probe),
      true,
      'obfuscated contact detail must be rejected: ' + probe
    );
  }
  assert.equal(
    hasSensitiveIdentifier('چک ساختگی با گواهی عدم پرداخت نمونه'),
    false,
    'synthetic legal wording must remain usable'
  );
});

test('diacritics, ZWNJ and mixed Persian/Arabic numerals keep the multi-topic cheque guard closed', () => {
  const { classify, isChequeOnlyScope } = classifier();
  const question = 'چَکِ تضمینی\u200c و ماده ٥٢٢';
  const matches = classify(question);
  const ids = Array.from(matches, item => item.id);
  assert.ok(ids.includes('instruments'), 'Arabic/Persian mixed-script cheque phrase must remain detectable');
  assert.ok(ids.includes('civil-procedure'), 'Arabic-Indic article numeral must remain detectable');
  assert.equal(isChequeOnlyScope(matches), false, 'a multi-topic question must not pass the cheque-only report gate');
});
