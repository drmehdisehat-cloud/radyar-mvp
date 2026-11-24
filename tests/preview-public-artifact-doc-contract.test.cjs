'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const docs = fs.readFileSync(path.join(root, 'docs/PREVIEW-PUBLIC-ARTIFACT.md'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/public-preview-review-artifact.yml'), 'utf8');
const verifier = fs.readFileSync(path.join(root, 'scripts/verify-public-preview-artifact.cjs'), 'utf8');
const manifestBuilder = fs.readFileSync(path.join(root, 'scripts/create-public-preview-integrity-manifest.cjs'), 'utf8');

test('public preview artifact documentation matches the exact two-file ZIP payload', () => {
  assert.match(workflow, /zip -q -X "\$archive" index\.html INTEGRITY\.json/);
  assert.match(workflow, /dadyar-preview-handoff\/public\/index\.html/);
  assert.match(workflow, /dadyar-preview-handoff\/public\/INTEGRITY\.json/);
  assert.match(verifier, /const EXPECTED_NAMES = \['INTEGRITY\.json', 'index\.html'\]/);
  assert.match(manifestBuilder, /path\.join\(publicDirectory, 'INTEGRITY\.json'\)/);

  assert.match(docs, /Artifact دقیقاً \*\*دو فایل\*\*/);
  assert.match(docs, /- `index\.html`/);
  assert.match(docs, /- `INTEGRITY\.json`/);
  assert.match(docs, /فهرست دقیق دو فایل/);
  assert.doesNotMatch(docs, /Artifact آن دقیقاً یک فایل دارد/);
});

test('public artifact docs keep operator handoff and release authorization outside the ZIP', () => {
  assert.match(docs, /پوشه `handoff\/`/);
  assert.match(docs, /در ZIP عمومی بارگذاری نمی‌شوند/);
  assert.match(docs, /هویت، سمت و استقلال بازبین احراز نمی‌شود/);
  assert.match(docs, /اثبات Restore، اعتبار مقصد، هویت بازبین/);
  assert.match(docs, /مجوز صریح مالک/);
  assert.match(docs, /هیچ گام CI در این Workflow استقرار انجام نمی‌دهد/);
});
