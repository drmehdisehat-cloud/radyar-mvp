'use strict';

// Keep the standalone offline preview and the server-side free-text router on
// the exact same 27-domain hint taxonomy. A drift here would make the preview
// silently classify a question differently from the eventual server flow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  TOPIC_HINTS,
  normalizeTopicText: normalizeServer,
  classifyLegalTopics
} = require('../backend/legal-topic-routing.cjs');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1];

function loadPreviewRouter() {
  assert.ok(script, 'offline preview inline script missing');
  const elements = new Map();
  const makeElement = () => ({
    value: '',
    textContent: '',
    hidden: false,
    disabled: false,
    checked: false,
    selectedIndex: 0,
    options: [],
    style: {},
    addEventListener() {},
    focus() {},
    contains() { return false; }
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement: makeElement
  };
  const sandbox = { document, URL: {}, Blob: class {}, setTimeout() {} };
  vm.runInNewContext(
    script + '\\nglobalThis.__topicHints = topicHints; ' +
      'globalThis.__classifyQuestion = classifyQuestion; ' +
      'globalThis.__normalizeTopicText = normalizeTopicText;',
    sandbox,
    { timeout: 1000 }
  );
  return sandbox;
}

test('offline preview taxonomy is identical to the server-side 27-domain registry', () => {
  const preview = loadPreviewRouter().__topicHints;
  assert.equal(preview.length, 27);
  assert.deepEqual(JSON.parse(JSON.stringify(preview)), TOPIC_HINTS);
});

test('offline preview and server classify the same multi-topic free-text corpus', () => {
  const preview = loadPreviewRouter();
  const questions = [
    'در سناریوی فرضی چک، اجاره و طلاق چه مدارکی باید بررسی شود؟',
    'چك تضمينی و جرم رايانه ای و قرارداد ساختگی',
    'جرم\u200cرایانه\u200cای و فیشینگ',
    'بارنامه و خسارت بار در حمل دریایی',
    'مالیات، گمرک و واردات',
    'سرقت، شکایت و دادسرا',
    'پرسش ساختگی با واژه‌های نامرتبط و بی‌سرنخ'
  ];
  for (const question of questions) {
    const browserIds = Array.from(preview.__classifyQuestion(question), item => item.id).sort();
    const serverIds = Array.from(classifyLegalTopics(question)).sort();
    assert.deepEqual(browserIds, serverIds, 'preview/server topic mismatch for: ' + question);
  }
});

test('offline preview and server normalize Persian/Arabic variants and combining marks equally', () => {
  const preview = loadPreviewRouter();
  const samples = [
    'كلاهبرداری يک چك',
    'جرم\u200cرایانه\u200cای',
    'مالیات   و\nگمرک',
    'مسئولیتِ مدنی',
    'تابعیت و تعارض قوانین'
  ];
  for (const sample of samples) {
    assert.equal(preview.__normalizeTopicText(sample), normalizeServer(sample));
  }
});
