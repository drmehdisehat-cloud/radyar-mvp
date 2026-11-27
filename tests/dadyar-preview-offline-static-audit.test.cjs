'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

function inlineBlocks(tag) {
  return [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'gi'))]
    .map(match => match[1]);
}

function cspContent() {
  const match = html.match(/<meta\\s+http-equiv="Content-Security-Policy"\\s+content="([^"]+)"/i);
  assert.ok(match, 'offline preview must declare a restrictive Content Security Policy');
  return match[1];
}

function sha256Directive(value) {
  return "'sha256-" + crypto.createHash('sha256').update(value, 'utf8').digest('base64') + "'";
}

test('offline preview CSP denies network, forms, frames, workers and unapproved resource origins', () => {
  const csp = cspContent();
  for (const directive of [
    "default-src 'none'",
    "connect-src 'none'",
    "img-src 'none'",
    "font-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'"
  ]) {
    assert.ok(csp.split(';').some(part => part.trim() === directive), 'missing CSP directive: ' + directive);
  }
  assert.equal(csp.includes('unsafe-inline'), false);
  assert.equal(csp.includes('unsafe-eval'), false);
  assert.equal(csp.includes('*'), false);
  assert.doesNotMatch(csp, /https?:/i);
});

test('the only inline script and style are pinned to their exact SHA-256 CSP hashes', () => {
  const scripts = inlineBlocks('script');
  const styles = inlineBlocks('style');
  assert.equal(scripts.length, 1, 'preview must have exactly one inline script');
  assert.equal(styles.length, 1, 'preview must have exactly one inline style');
  const csp = cspContent();
  const scriptDirective = csp.split(';').find(part => part.trim().startsWith('script-src '));
  const styleDirective = csp.split(';').find(part => part.trim().startsWith('style-src '));
  assert.ok(scriptDirective, 'script-src must be explicit');
  assert.ok(styleDirective, 'style-src must be explicit');
  assert.ok(scriptDirective.includes(sha256Directive(scripts[0])), 'script-src hash must match the exact inline script bytes');
  assert.ok(styleDirective.includes(sha256Directive(styles[0])), 'style-src hash must match the exact inline style bytes');
  assert.equal(scriptDirective.includes('unsafe-inline'), false);
  assert.equal(scriptDirective.includes('unsafe-eval'), false);
  assert.equal(styleDirective.includes('unsafe-inline'), false);
});

test('offline preview contains no external resource attributes, forms, frames or CSS imports', () => {
  assert.doesNotMatch(html, /\\b(?:src|href|action|formaction|poster)\\s*=\\s*["'](?:https?:)?\\/\\//i);
  assert.doesNotMatch(html, /<\\s*(?:form|iframe|frame|object|embed)\\b/i);
  const styles = inlineBlocks('style').join('\\n');
  assert.doesNotMatch(styles, /@import\\b|url\\s*\\(\\s*["']?(?:https?:)?\\/\\//i);
  assert.doesNotMatch(styles, /@font-face\\b/i);
});

test('inline preview logic does not expose browser network APIs or service-worker entry points', () => {
  const scripts = inlineBlocks('script');
  assert.equal(scripts.length, 1);
  assert.doesNotMatch(
    scripts[0],
    /\\bfetch\\s*\\(|\\bXMLHttpRequest\\b|\\bWebSocket\\b|\\bEventSource\\b|\\bsendBeacon\\b|navigator\\s*\\.\\s*serviceWorker|\\bimportScripts\\s*\\(/i
  );
  assert.doesNotMatch(scripts[0], /https?:\\/\\/|\\/api\\//i);
});
