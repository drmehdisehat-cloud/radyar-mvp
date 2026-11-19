'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildOfflinePreviewPackage } = require('../scripts/build-offline-preview-package.cjs');

const sourceHtml = fs.readFileSync(
  path.join(__dirname, '../dadyar-preview/index.html'),
  'utf8'
);
const commit = 'feeffe42e3eef5d8989027fef4ac02c153cf0145';
const branch = 'dadyar/ai-chat-private-20261101';

function withFixture(t, html, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-self-contained-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repoRoot = path.join(root, 'checkout');
  const previewDirectory = path.join(repoRoot, 'dadyar-preview');
  fs.mkdirSync(previewDirectory, { recursive: true });
  const sourcePath = path.join(previewDirectory, 'index.html');
  fs.writeFileSync(sourcePath, html, { mode: 0o600 });
  const destination = path.join(root, 'package');
  return callback({ repoRoot, sourcePath, destination });
}

function build(fixture) {
  return buildOfflinePreviewPackage(fixture.destination, {
    repoRoot: fixture.repoRoot,
    sourcePath: fixture.sourcePath,
    commit,
    branch
  });
}

for (const [label, fragment] of [
  ['relative script', '<script src="./assets/app.js"></script>'],
  ['relative stylesheet', '<link rel="stylesheet" href="./assets/site.css">'],
  ['relative image', '<img src="./assets/logo.svg" alt="sample">'],
  ['relative media', '<video poster="./assets/poster.png"></video>'],
  ['srcset image', '<img srcset="./assets/a.png 1x, ./assets/b.png 2x" alt="sample">']
]) {
  test('package builder rejects ' + label + ' references in the single-file public payload', t => {
    const html = sourceHtml.replace('</body>', fragment + '</body>');
    withFixture(t, html, fixture => {
      assert.throws(() => build(fixture), /self-contained|resource reference/i);
      assert.equal(fs.existsSync(fixture.destination), false);
    });
  });
}

for (const [label, fragment] of [
  ['CSS url()', '<style>body{background-image:url("./assets/background.png")}</style>'],
  ['CSS @import', '<style>@import url("./assets/extra.css");</style>'],
  ['inline style URL', '<main style="background-image:url(./assets/background.png)">نمونه</main>']
]) {
  test('package builder rejects ' + label + ' resource loading', t => {
    const html = sourceHtml.replace('</body>', fragment + '</body>');
    withFixture(t, html, fixture => {
      assert.throws(() => build(fixture), /self-contained|resource reference/i);
      assert.equal(fs.existsSync(fixture.destination), false);
    });
  });
}

test('package builder rejects meta refresh navigation in the public payload', t => {
  const html = sourceHtml.replace('</head>', '<meta http-equiv="refresh" content="0;url=./other.html"></head>');
  withFixture(t, html, fixture => {
    assert.throws(() => build(fixture), /self-contained|refresh navigation/i);
    assert.equal(fs.existsSync(fixture.destination), false);
  });
});

test('package builder rejects HTML form submission controls in the public payload', t => {
  const html = sourceHtml.replace('</body>',
    '<FORM action="/submit" method="post"><button>ارسال</button></FORM></body>');
  withFixture(t, html, fixture => {
    assert.throws(() => build(fixture), /forms|self-contained|resource reference/i);
    assert.equal(fs.existsSync(fixture.destination), false);
  });
});

test('package builder does not mistake a longer custom element name for a form', t => {
  const html = sourceHtml.replace('</body>', '<formality>نمونه</formality></body>');
  withFixture(t, html, fixture => {
    const result = build(fixture);
    assert.equal(result.checksums_verified, true);
    assert.equal(result.release_authorized, false);
    assert.equal(result.api_enabled, false);
  });
});

test('the current offline preview remains eligible as a self-contained single HTML file', t => {
  withFixture(t, sourceHtml, fixture => {
    const result = build(fixture);
    assert.equal(result.checksums_verified, true);
    assert.equal(result.release_authorized, false);
    assert.equal(result.api_enabled, false);
    assert.deepEqual(fs.readdirSync(path.join(fixture.destination, 'public')), ['index.html']);
    assert.deepEqual(
      fs.readFileSync(path.join(fixture.destination, 'public', 'index.html')),
      fs.readFileSync(fixture.sourcePath)
    );
  });
});
