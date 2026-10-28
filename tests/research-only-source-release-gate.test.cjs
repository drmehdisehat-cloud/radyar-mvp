'use strict';
// Synthetic-only regression: research notes must never become release evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const gate = path.resolve(__dirname, '../scripts/check-v1-readiness.cjs');
const topics = ['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh'];
const today = new Date().toISOString().slice(0, 10);

function audit(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-research-gate-'));
  try {
    fs.mkdirSync(path.join(root, 'docs'));
    const source = {
      title: 'Synthetic source (not legally verified)',
      url: 'https://qavanin.ir/Law/TreeText/?IDS=1',
      checked: today,
      status: 'verified',
      releaseSourceEligible: true,
      legalConclusionPermitted: true,
      legalReview: {
        effectiveDate: '2020-01-01',
        reviewedAt: today,
        reviewer: 'Synthetic reviewer',
        amendmentStatus: 'checked-current'
      },
      ...overrides
    };
    fs.writeFileSync(path.join(root, 'flows.js'),
      'const flows = ' + JSON.stringify(Object.fromEntries(
        topics.map(id => [id, { title: 'Synthetic', source }]))) + ';');
    // Deliberately permissive helpers ensure the release audit checks its own boundary.
    fs.writeFileSync(path.join(root, 'export.js'),
      'function safeLawSource() { return true; }\n' +
      'function validReviewDate() { return true; }\n');
    const labels = [
      'Sync reviewed local source', 'Add read-only GitHub Actions CI',
      'Run real browser tests', 'Verify server-side validation',
      'Review authentication', 'Cite authoritative Iranian legal texts',
      'Obtain explicit owner approval'
    ];
    fs.writeFileSync(path.join(root, 'docs/V1-RELEASE-GATES.md'),
      labels.map(label => '- [x] ' + label + ' (synthetic only)').join('\n'));
    const run = spawnSync(process.execPath, [gate, '--root', root, '--enforce'],
      { encoding: 'utf8', timeout: 5000 });
    if (run.error) throw run.error;
    assert.ok(run.status === 0 || run.status === 1, run.stderr);
    return { exitCode: run.status, result: JSON.parse(run.stdout) };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('unmarked synthetic evidence passes only mechanical checks', () => {
  const { exitCode, result } = audit();
  assert.equal(exitCode, 0);
  assert.equal(result.status, 'EVIDENCE_CHECKS_PASSED');
  assert.equal(result.sourceCoverage, '6/6');
  assert.equal(result.humanReviewCoverage, '6/6');
});

test('research-only and draft source status override fabricated sign-off', () => {
  for (const status of ['research-only', 'draft', 'pending-review', null]) {
    const { exitCode, result } = audit({ status });
    assert.equal(exitCode, 1, String(status));
    assert.equal(result.status, 'NOT_READY', String(status));
    assert.equal(result.sourceCoverage, '0/6', String(status));
    assert.equal(result.humanReviewCoverage, '0/6', String(status));
    assert.equal(result.issues.filter(x => x.startsWith('research_only_legal_source:')).length,
      6, String(status));
  }
});

test('explicit release-ineligible flags override otherwise complete metadata', () => {
  for (const overrides of [
    { releaseSourceEligible: false },
    { legalConclusionPermitted: false },
    { status: 'verified', releaseSourceEligible: false },
    { status: 'verified', legalConclusionPermitted: false }
  ]) {
    const { exitCode, result } = audit(overrides);
    assert.equal(exitCode, 1, JSON.stringify(overrides));
    assert.equal(result.sourceCoverage, '0/6', JSON.stringify(overrides));
    assert.equal(result.humanReviewCoverage, '0/6', JSON.stringify(overrides));
    assert.equal(result.issues.filter(x => x.startsWith('research_only_legal_source:')).length,
      6, JSON.stringify(overrides));
  }
});

test('ambiguous non-boolean eligibility flags fail closed', () => {
  // These values are truthy or false-like in JavaScript, but none is
  // an explicit affirmative boolean approval for legal release.
  for (const overrides of [
    { status: 'verified', releaseSourceEligible: 'false' },
    { status: 'verified', releaseSourceEligible: 'true' },
    { status: 'verified', releaseSourceEligible: 0 },
    { status: 'verified', releaseSourceEligible: null },
    { status: 'verified', legalConclusionPermitted: 'false' },
    { status: 'verified', legalConclusionPermitted: 'true' },
    { status: 'verified', legalConclusionPermitted: 0 },
    { status: 'verified', legalConclusionPermitted: null }
  ]) {
    const { exitCode, result } = audit(overrides);
    assert.equal(exitCode, 1, JSON.stringify(overrides));
    assert.equal(result.status, 'NOT_READY', JSON.stringify(overrides));
    assert.equal(result.sourceCoverage, '0/6', JSON.stringify(overrides));
    assert.equal(result.humanReviewCoverage, '0/6', JSON.stringify(overrides));
    assert.equal(result.issues.filter(x =>
      x.startsWith('research_only_legal_source:')).length, 6,
      JSON.stringify(overrides));
  }
});

test('literal true eligibility flags remain mechanically admissible', () => {
  const { exitCode, result } = audit({
    status: 'verified',
    releaseSourceEligible: true,
    legalConclusionPermitted: true
  });
  assert.equal(exitCode, 0);
  assert.equal(result.status, 'EVIDENCE_CHECKS_PASSED');
  assert.equal(result.sourceCoverage, '6/6');
  assert.equal(result.humanReviewCoverage, '6/6');
});

test('missing explicit approval fields cannot be treated as approval', () => {
  for (const overrides of [
    { status: undefined },
    { releaseSourceEligible: undefined },
    { legalConclusionPermitted: undefined },
    { status: 'verified', releaseSourceEligible: undefined }
  ]) {
    const { exitCode, result } = audit(overrides);
    assert.equal(exitCode, 1, JSON.stringify(overrides));
    assert.equal(result.status, 'NOT_READY');
    assert.equal(result.sourceCoverage, '0/6');
    assert.equal(result.humanReviewCoverage, '0/6');
    assert.equal(result.issues.filter(x =>
      x.startsWith('research_only_legal_source:')).length, 6);
  }
});
