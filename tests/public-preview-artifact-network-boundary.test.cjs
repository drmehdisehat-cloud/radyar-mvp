'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { verifyHtml } = require('../scripts/verify-public-preview-artifact.cjs');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'));

function withHead(fragment) {
  const html = source.toString('utf8');
  assert.ok(html.includes('</head>'), 'source preview must contain a closing head tag');
  return Buffer.from(html.replace('</head>', fragment + '</head>'), 'utf8');
}

test('current public preview HTML passes the independent ZIP payload policy', () => {
  assert.deepEqual(verifyHtml(source), { topicCount: 27 });
});

test('downloaded payload verifier rejects meta refresh navigation', () => {
  const tampered = withHead('<meta http-equiv="refresh" content="0;url=https://example.invalid/">');
  assert.throws(() => verifyHtml(tampered), /preview_meta_refresh_rejected/);
});

test('downloaded payload verifier rejects a base element that can rewrite relative navigation', () => {
  const tampered = withHead('<base href="https://example.invalid/">');
  assert.throws(() => verifyHtml(tampered), /preview_base_element_rejected/);
});

test('downloaded payload verifier rejects same-origin resource URLs as network-capable', () => {
  const tampered = withHead('<img src="/tracking.gif" alt="">');
  assert.throws(() => verifyHtml(tampered), /preview_resource_reference_detected/);
});

test('downloaded payload verifier rejects external SVG references', () => {
  const tampered = withHead('<svg><use href="https://example.invalid/sprite.svg#icon"></use></svg>');
  assert.throws(() => verifyHtml(tampered), /preview_external_svg_reference_detected/);
});

test('downloaded payload verifier rejects CSS url and import references', () => {
  const tampered = withHead('<style>body{background:url(/tracking.png)}</style>');
  assert.throws(() => verifyHtml(tampered), /preview_css_resource_reference_detected/);
});
