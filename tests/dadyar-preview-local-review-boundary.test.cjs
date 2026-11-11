'use strict';
// Synthetic-only UX contract: local acknowledgement is not authenticated identity.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('offline reviewer flow is visibly labelled as a local unauthenticated attestation', () => {
  const sectionStart = html.indexOf('<section id="human-review"');
  const downloadStart = html.indexOf('<button type="button" id="download"', sectionStart);
  assert.ok(sectionStart >= 0 && downloadStart > sectionStart, 'human-review section missing');
  const section = html.slice(sectionStart, downloadStart);
  assert.match(section, /بازبینی محلی توسط انسان \(بدون احراز هویت\)/);
  assert.match(section, /هویت یا سمت بازبین احراز نمی‌شود/);
  assert.match(section, /ثبت اظهار محلی بازبین/);
  assert.ok(
    section.indexOf('هویت یا سمت بازبین احراز نمی‌شود') < section.indexOf('id="reviewer-name"'),
    'identity limitation must appear before reviewer input'
  );
  assert.match(section, /هویت بازبین در این نسخه آفلاین احراز نمی‌شود/);
});

test('downloaded report labels the review as local and never claims authenticated or legal approval', () => {
  const handler = html.slice(html.indexOf("document.getElementById('download').addEventListener"));
  assert.match(handler, /ثبت بازبینی انسانی \(اظهار محلی؛ هویت احراز نشده\)/);
  assert.match(handler, /این اظهار محلی است و تأیید حقوقی یا احراز هویت محسوب نمی‌شود/);
  assert.doesNotMatch(handler, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB)\b/);
});

test('offline preview keeps network access disabled while preserving the review gate', () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /id="download" disabled/);
  assert.match(html, /reviewRecord\.decision==='approved'/);
  assert.match(html, /reviewRecord\.reportSnapshot===report/);
});
