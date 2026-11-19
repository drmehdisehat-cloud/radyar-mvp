'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'offline preview inline script must exist');

test('user-controlled preview content is rendered only through text-safe sinks', () => {
  assert.match(script, /out\.textContent=report/);
  assert.match(script, /reviewStatus\.textContent=/);
  assert.match(script, /exportStatus\.textContent=/);
  assert.doesNotMatch(script, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/);
  assert.match(script, /new Blob\(\['\\uFEFF'\+exportText\],\{type:'text\/plain;charset=utf-8'\}\)/);
  assert.match(script, /a\.download='dadyar-synthetic-cheque\.txt'/);
});

test('free text is discarded before report construction and cannot be echoed as raw input', () => {
  const start = script.indexOf("document.getElementById('generate').addEventListener");
  const end = script.indexOf("document.getElementById('download').addEventListener");
  assert.ok(start >= 0 && end > start, 'generation and export handlers must be present');
  const generation = script.slice(start, end);
  assert.match(generation, /freeQuestionField\.value='';/);
  assert.match(generation, /freeQuestion='';/);
  assert.match(generation, /const displayQuestion=hasSensitiveIdentifier/);
  assert.match(generation, /if\(hasSensitiveIdentifier\) conflicts\.push/);
  assert.doesNotMatch(generation, /report=\[[\s\S]*?\+freeQuestion/);
  assert.match(generation, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
});

test('reviewer notes are normalized but remain plain text, and approval is bound to one report snapshot', () => {
  const helper = script.match(/function safeReviewText\(value,max\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, 'review metadata sanitizer must exist');
  const sanitize = vm.runInNewContext('(' + helper + ')');
  const payload = '<img src=x onerror=alert(1)>\u202eیادداشت';
  assert.equal(sanitize(payload, 300), '<img src=x onerror=alert(1)>یادداشت');
  const handler = script.slice(script.indexOf("document.getElementById('download').addEventListener"));
  assert.match(handler, /reviewRecord\.reportSnapshot===report/);
  assert.match(handler, /type:'text\/plain;charset=utf-8'/);
  assert.match(handler, /reviewRecord=null/);
  assert.match(handler, /بازبینی تازه را از ابتدا ثبت کنید/);
});

test('the offline preview has no remote request or persistent browser-storage path', () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(script, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB)\b/);
});
