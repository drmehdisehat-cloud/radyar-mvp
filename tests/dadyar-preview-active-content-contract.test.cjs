'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
// Static defense in depth for a single-file, no-network preview. These checks
// complement, but cannot replace, actual browser network observation.
const inlineEvent = /\son(?:load|error|click|submit|change|focus|mouseover)\s*=/i;
const remoteBase = /<base\b[^>]*\bhref\s*=/i;
const activeEmbed = /<(?:object|embed|frame|iframe)\b/i;
const dynamicNavigation = /\b(?:window\.open|location\.assign|location\.replace|document\.write|importScripts)\s*\(/i;
const formSubmission = /\b(?:requestSubmit|submit)\s*\(/i;
const remoteScheme = /\b(?:https?:|wss?:)\/\//i;

test('preview has no active embeds, event-handler attributes or script-driven navigation', () => {
  assert.doesNotMatch(html, inlineEvent);
  assert.doesNotMatch(html, remoteBase);
  assert.doesNotMatch(html, activeEmbed);
  assert.doesNotMatch(html, dynamicNavigation);
  assert.doesNotMatch(html, formSubmission);
  assert.doesNotMatch(html, remoteScheme);
});
test('offline guard rejects representative exfiltration regressions', () => {
  assert.match('<img onerror="alert(1)">', inlineEvent);
  assert.match('<base href="/api/">', remoteBase);
  assert.match('<embed src="/api/">', activeEmbed);
  assert.match('window.open("/api/collect")', dynamicNavigation);
  assert.match('form.requestSubmit()', formSubmission);
  assert.match('wss://example.invalid/socket', remoteScheme);
});
