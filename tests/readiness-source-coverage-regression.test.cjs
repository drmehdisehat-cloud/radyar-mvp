'use strict';
// Synthetic-only regression: invalid source metadata must never inflate release coverage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const auditScript = path.join(root, 'scripts/check-v1-readiness.cjs');

function audit({ injection = '', checkBoxes = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-readiness-'));
  try {
    fs.mkdirSync(path.join(directory, 'docs'));
    fs.writeFileSync(path.join(directory, 'flows.js'),
      fs.readFileSync(path.join(root, 'flows.js'), 'utf8') + '\n' + injection);
    fs.copyFileSync(path.join(root, 'export.js'), path.join(directory, 'export.js'));
    const checklist = fs.readFileSync(path.join(root, 'docs/V1-RELEASE-GATES.md'), 'utf8');
    fs.writeFileSync(path.join(directory, 'docs/V1-RELEASE-GATES.md'),
      checkBoxes ? checklist.replace(/^- \[ \] /gm, '- [x] ') : checklist);
    const run = spawnSync(process.execPath, [auditScript, '--root', directory, '--enforce'],
      { encoding: 'utf8', timeout: 5000 });
    if (run.error) throw run.error;
    assert.equal(run.status, 1, 'unreviewed synthetic fixtures must block release');
    return JSON.parse(run.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('release gate fails closed on the actual unreviewed topic inventory', () => {
  const result = audit();
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.sourceCoverage, '0/6');
  assert.equal(result.humanReviewCoverage, '0/6');
  assert.ok(result.issues.some(issue => issue.startsWith('missing_legal_source:')));
});

test('malformed official-looking links never count as source coverage', () => {
  const result = audit({ injection: `
    for (const flow of Object.values(flows)) {
      flow.source = { title: 'منبع ساختگی', url: 'https://invalid.example/test',
        checked: '2026-10-20' };
    }` });
  assert.equal(result.sourceCoverage, '0/6');
  assert.equal(result.humanReviewCoverage, '0/6');
  assert.equal(result.issues.filter(issue => issue.startsWith('unsafe_source_metadata:')).length, 6);
});

test('safe link metadata and checked boxes do not substitute for human legal review', () => {
  const result = audit({ checkBoxes: true, injection: `
    for (const flow of Object.values(flows)) {
      flow.source = { title: 'پیوند آزمایشی', url: 'https://qavanin.ir/Law/TreeText/?IDS=0',
        checked: '2026-10-20' };
    }` });
  assert.equal(result.sourceCoverage, '6/6');
  assert.equal(result.humanReviewCoverage, '0/6');
  assert.equal(result.uncheckedGates, 0);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.issues.filter(issue => issue.startsWith('missing_human_legal_review:')).length, 6);
});
