'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'dadyar-preview/index.html'), 'utf8');

test('signed-review report adapter is not mounted by the development API server', () => {
  assert.doesNotMatch(server, /review-release-http-handler/);
  assert.doesNotMatch(server, /\/api\/dadyar\/review-report/);
});

test('offline preview clearly states that its review acknowledgement is not authentication', () => {
  assert.match(preview, /بازبینی محلی توسط انسان/);
  assert.match(preview, /هویت یا سمت بازبین احراز نمی‌شود/);
  assert.match(preview, /بدون احراز هویت/);
});

test('offline preview fixes the reviewer label to a synthetic read-only value', () => {
  const input = preview.match(/<input\\b(?=[^>]*\\bid="reviewer-name")[^>]*>/i)?.[0];
  assert.ok(input, 'reviewer label input must exist');
  assert.match(input, /\\breadonly\\b/i);
  assert.match(input, /value="بازبین آزمون"/);
  assert.doesNotMatch(input, /name="[^"]+"/i, 'reviewer label must not be submitted as a form field');
});

test('offline preview cannot call the unmounted report-release route', () => {
  const scripts = [...preview.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)];
  assert.equal(scripts.length, 1, 'preview must remain a single inline script');
  assert.match(preview, /connect-src 'none'/);
  assert.doesNotMatch(scripts[0][1], /\\bfetch\\s*\\(|\\bXMLHttpRequest\\b|\\bWebSocket\\b|\\bEventSource\\b|\\bsendBeacon\\b/i);
  assert.doesNotMatch(scripts[0][1], /\\/api\\/dadyar\\/review-report/);
});
