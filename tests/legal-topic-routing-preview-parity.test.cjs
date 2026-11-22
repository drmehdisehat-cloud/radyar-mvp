'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TOPIC_HINTS, classifyLegalTopics } = require('../backend/legal-topic-routing.cjs');

const previewHtml = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const previewScript = previewHtml.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1];

function parseHintTable(source, declaration, label) {
  const escaped = declaration.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
  const match = source.match(new RegExp('const ' + escaped + ' = (\\[[\\s\\S]*?\\n\\]);\\s*function normalizeTopicText'));
  assert.ok(match, label + ' topic hint table must exist');
  return JSON.parse(match[1]);
}

function browserClassifier() {
  assert.ok(previewScript, 'offline preview inline script must exist');
  const hints = parseHintTable(previewScript, 'topicHints', 'browser');
  const helpers = previewScript.match(/function normalizeTopicText\\(value\\) \\{[\\s\\S]*?\\n\\}\\nfunction classifyQuestion\\(text\\) \\{[\\s\\S]*?\\n\\}/)?.[0];
  assert.ok(helpers, 'browser topic normalization and classifier must exist');
  const sandbox = {};
  vm.runInNewContext(
    'const topicHints = ' + JSON.stringify(hints) + ';\\n' +
    helpers + ';\\n' +
    'globalThis.classify = classifyQuestion;',
    sandbox,
    { timeout: 1000 }
  );
  return sandbox.classify;
}

test('server and offline preview retain the same 27 unique legal-domain hint groups', () => {
  const browserHints = parseHintTable(previewScript, 'topicHints', 'browser');
  assert.equal(TOPIC_HINTS.length, 27);
  assert.equal(browserHints.length, 27);
  assert.equal(new Set(TOPIC_HINTS.map(item => item.id)).size, 27);
  assert.equal(new Set(browserHints.map(item => item.id)).size, 27);
  assert.deepEqual(browserHints, TOPIC_HINTS,
    'offline preview and private assistant must use the same ordered IDs and keyword lists');
});

test('server and offline browser classify the same synthetic multi-topic questions', () => {
  const classifyBrowser = browserClassifier();
  const probes = [
    'در چک تضمینی، اجاره، طلاق و ماده ۵۲۲ چه مدارکی باید بررسی شود؟',
    'چك صیادی و جرم رايانه ای و فیشینگ',
    'خسارت تأخیر تأدیه چک',
    'چک   تضمینی\\nاجاره',
    'موضوع نامرتبط و بی‌کلیدواژه'
  ];
  for (const question of probes) {
    const browserIds = Array.from(classifyBrowser(question), item => item.id);
    assert.deepEqual(browserIds, classifyLegalTopics(question),
      'browser/server topic routing drift for synthetic question: ' + question);
  }
});

test('topic routing parity test contains no network, storage, or real-client fixture', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.doesNotMatch(source, /\\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\\b/);
  assert.match(source, /synthetic multi-topic questions/);
  assert.doesNotMatch(source, /(?:\\+?98|09)\\d{8,}/);
});
