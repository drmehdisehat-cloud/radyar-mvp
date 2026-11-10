'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const hintsSource = html.match(/const topicHints = (\\[[\\s\\S]*?\\n\\]);\\nfunction normalizeTopicText/)?.[1];
const helpersSource = html.match(/function normalizeTopicText\\(value\\) \\{[\\s\\S]*?function describeTopicScope\\(matches, question\\) \\{[\\s\\S]*?\\n\\}/)?.[0];

function helpers() {
  assert.ok(hintsSource, '27-domain hint table missing');
  assert.ok(helpersSource, 'topic classifier helpers missing');
  return vm.runInNewContext(
    'const topicHints = ' + hintsSource + ';\\n' + helpersSource + ';\\n({ topicHints, classifyQuestion, describeTopicScope })'
  );
}

test('multi-topic classifier retains all 27 internal legal-domain hints', () => {
  const { topicHints } = helpers();
  assert.equal(topicHints.length, 27);
  assert.equal(new Set(topicHints.map(item => item.id)).size, 27);
});

test('free question detects cheque plus family and property topics without exposing labels', () => {
  const { classifyQuestion, describeTopicScope } = helpers();
  const question = 'در چک و طلاق و اجاره چه مدارکی باید بررسی شود؟';
  const matches = classifyQuestion(question);
  assert.deepEqual(Array.from(matches, item => item.id).sort(), ['family', 'instruments', 'property']);
  const message = describeTopicScope(matches, question);
  assert.match(message, /چندموضوعی/);
  for (const hiddenLabel of ['family', 'instruments', 'property', 'طلاق', 'اجاره']) {
    assert.equal(message.includes(hiddenLabel), false);
  }
});

test('a non-cheque question is flagged as outside the synthetic cheque preview', () => {
  const { classifyQuestion, describeTopicScope } = helpers();
  const question = 'برای طلاق و مهریه چه مدارکی لازم است؟';
  const message = describeTopicScope(classifyQuestion(question), question);
  assert.match(message, /خارج از دامنه/);
  assert.match(message, /تحلیل ارائه نمی‌کند/);
});

test('a cheque-only question stays within scope and an empty question is not misclassified', () => {
  const { classifyQuestion, describeTopicScope } = helpers();
  assert.match(describeTopicScope(classifyQuestion('چک'), 'چک'), /هم‌راستاست/);
  assert.match(describeTopicScope([], ''), /طبقه‌بندی موضوعی انجام نشد/);
});

test('the browser uses internal matches for a neutral scope notice and clears stale notices', () => {
  assert.match(html, /const topicScopeStatus=document\\.getElementById\\('topic-scope-status'\\)/);
  assert.match(html, /describeTopicScope\\(internalTopicMatches,freeQuestion\\)/);
  assert.match(html, /topicScopeStatus\\.textContent=topicScopeMessage/);
  assert.match(html, /topicScopeStatus\\.textContent=''/);
  assert.match(html, /دامنه بررسی پرسش آزاد:/);
  assert.doesNotMatch(html, /topicScopeStatus\\.textContent[^;]*(?:family|property|instruments)/);
});

test('the CSP script hash matches the exact inline script bytes', () => {
  const script = html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1];
  const declared = html.match(/script-src 'sha256-([^']+)'/)?.[1];
  assert.ok(script && declared, 'inline script or CSP hash missing');
  const actual = crypto.createHash('sha256').update(script, 'utf8').digest('base64');
  assert.equal(actual, declared);
});
