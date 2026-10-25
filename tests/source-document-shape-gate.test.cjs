'use strict';
// A display-safe portal link must not inflate the v1 release evidence metric.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const auditScript = path.join(root, 'scripts/check-v1-readiness.cjs');

function auditFor(url) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-document-shape-'));
  try {
    fs.mkdirSync(path.join(directory, 'docs'));
    const flows = fs.readFileSync(path.join(root, 'flows.js'), 'utf8');
    fs.writeFileSync(path.join(directory, 'flows.js'), flows + '\n' +
      'for (const flow of Object.values(flows)) flow.source = {' +
      'title: "منبع ساختگی", url: ' + JSON.stringify(url) +
      ', checked: "2026-10-24" };\n');
    fs.copyFileSync(path.join(root, 'export.js'), path.join(directory, 'export.js'));
    fs.copyFileSync(path.join(root, 'docs/V1-RELEASE-GATES.md'),
      path.join(directory, 'docs/V1-RELEASE-GATES.md'));
    const result = spawnSync(process.execPath, [auditScript, '--root', directory],
      { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('generic dotic and majlis paths do not count as verified document shapes', () => {
  for (const url of ['https://dotic.ir/law', 'https://rc.majlis.ir/fa/law']) {
    const result = auditFor(url);
    assert.equal(result.sourceCoverage, '0/6', url);
    assert.equal(result.humanReviewCoverage, '0/6', url);
    assert.equal(result.issues.filter(x =>
      x.startsWith('unverified_source_document_pattern:')).length, 6, url);
  }
});

test('zero and ambiguous document IDs fail at the display-safety boundary', () => {
  for (const url of [
    'https://qavanin.ir/Law/TreeText/?IDS=0',
    'https://qavanin.ir/Law/TreeText/?IDS=000123',
  ]) {
    const result = auditFor(url);
    assert.equal(result.sourceCoverage, '0/6', url);
    assert.equal(result.humanReviewCoverage, '0/6', url);
    assert.equal(result.issues.filter(x =>
      x.startsWith('unsafe_source_metadata:')).length, 6, url);
  }
});

test('positive direct qavanin IDs are only structural candidates, not legal review', () => {
  const result = auditFor('https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131');
  assert.equal(result.sourceCoverage, '6/6');
  assert.equal(result.humanReviewCoverage, '0/6');
  assert.equal(result.status, 'NOT_READY');
});
