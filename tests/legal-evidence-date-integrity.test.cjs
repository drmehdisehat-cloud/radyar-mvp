'use strict';
// Synthetic-only regression: a permissive UI helper must not override the
// release audit's independent calendar and future-date checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const gate = path.resolve(__dirname, '../scripts/check-v1-readiness.cjs');
const ids = ['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh'];
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

function audit({ checked = today, reviewedAt = today, effectiveDate = '2020-01-01' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-date-integrity-'));
  try {
    fs.mkdirSync(path.join(dir, 'docs'));
    const source = {
      title: 'Synthetic legal text',
      url: 'https://qavanin.ir/Law/TreeText/?IDS=1',
      checked,
      status: 'verified',
      releaseSourceEligible: true,
      legalConclusionPermitted: true,
      legalReview: {
        effectiveDate, reviewedAt,
        reviewer: 'Synthetic reviewer', amendmentStatus: 'checked-current'
      }
    };
    fs.writeFileSync(path.join(dir, 'flows.js'),
      'const flows = ' + JSON.stringify(Object.fromEntries(
        ids.map(id => [id, { title: 'Synthetic', source }]))) + ';');
    // Deliberately permissive: release audit must not trust UI helpers alone.
    fs.writeFileSync(path.join(dir, 'export.js'),
      'function safeLawSource() { return true; }\n' +
      'function validReviewDate() { return true; }\n');
    const labels = [
      'Sync reviewed local source', 'Add read-only GitHub Actions CI',
      'Run real browser tests', 'Verify server-side validation',
      'Review authentication', 'Cite authoritative Iranian legal texts',
      'Obtain explicit owner approval'
    ];
    fs.writeFileSync(path.join(dir, 'docs/V1-RELEASE-GATES.md'),
      labels.map(label => '- [x] ' + label + ' (synthetic only)').join('\n'));
    const run = spawnSync(process.execPath, [gate, '--root', dir, '--enforce'],
      { encoding: 'utf8', timeout: 5000 });
    if (run.error) throw run.error;
    return { code: run.status, result: JSON.parse(run.stdout) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('well-formed synthetic dates pass only the mechanical audit', () => {
  const { code, result } = audit();
  assert.equal(code, 0);
  assert.equal(result.status, 'EVIDENCE_CHECKS_PASSED');
  assert.equal(result.humanReviewCoverage, '6/6');
});

test('future or impossible source-check dates cannot inflate coverage', () => {
  for (const checked of [tomorrow, '2026-02-30', '2026-13-01', '2026-00-01']) {
    const { code, result } = audit({ checked });
    assert.equal(code, 1, checked);
    assert.equal(result.sourceCoverage, '0/6', checked);
    assert.equal(result.humanReviewCoverage, '0/6', checked);
    assert.equal(result.issues.filter(x => x.startsWith('invalid_source_check_date:')).length, 6);
  }
});

test('future or impossible legal-review dates cannot count as human review', () => {
  for (const fields of [
    { reviewedAt: tomorrow },
    { reviewedAt: '2026-02-30' },
    { effectiveDate: tomorrow },
    { effectiveDate: '2026-02-30' }
  ]) {
    const { code, result } = audit(fields);
    assert.equal(code, 1, JSON.stringify(fields));
    assert.equal(result.sourceCoverage, '6/6');
    assert.equal(result.humanReviewCoverage, '0/6');
    assert.equal(result.issues.filter(x => x.startsWith('missing_human_legal_review:')).length, 6);
  }
});
