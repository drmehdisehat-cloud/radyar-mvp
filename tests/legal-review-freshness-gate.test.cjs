'use strict';
// Synthetic-only freshness gate regression. Freshness is not legal verification.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const gate = path.resolve(__dirname, '../scripts/check-v1-readiness.cjs');
const topics = ['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh'];
const daysAgo = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

function audit(checked, reviewedAt) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-freshness-'));
  try {
    fs.mkdirSync(path.join(root, 'docs'));
    const source = {
      title: 'منبع کاملاً ساختگی',
      url: 'https://qavanin.ir/Law/TreeText/?IDS=1',
      checked,
      legalReview: {
        effectiveDate: '2020-01-01',
        reviewedAt,
        reviewer: 'Synthetic reviewer',
        amendmentStatus: 'checked-current'
      }
    };
    fs.writeFileSync(path.join(root, 'flows.js'),
      'const flows = ' + JSON.stringify(Object.fromEntries(
        topics.map(id => [id, { title: 'Synthetic', source }]))) + ';');
    fs.writeFileSync(path.join(root, 'export.js'),
      'function safeLawSource(source) { return /^https:\\/\\/qavanin\\.ir\\/Law\\/TreeText\\/\\?IDS=[1-9]\\d*$/.test(source.url); }\n' +
      'function validReviewDate(date) { return /^\\d{4}-\\d{2}-\\d{2}$/.test(date); }\n');
    const labels = [
      'Sync reviewed local source',
      'Add read-only GitHub Actions CI',
      'Run real browser tests',
      'Verify server-side validation',
      'Review authentication',
      'Cite authoritative Iranian legal texts',
      'Obtain explicit owner approval'
    ];
    fs.writeFileSync(path.join(root, 'docs/V1-RELEASE-GATES.md'),
      labels.map(label => '- [x] ' + label + ' (synthetic only)').join('\n'));
    const run = spawnSync(process.execPath, [gate, '--root', root, '--enforce'],
      { encoding: 'utf8', timeout: 5000 });
    if (run.error) throw run.error;
    return { status: run.status, audit: JSON.parse(run.stdout) };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('180-day freshness permits mechanical evidence only', () => {
  const { status, audit: result } = audit(daysAgo(179), daysAgo(179));
  assert.equal(status, 0);
  assert.equal(result.status, 'EVIDENCE_CHECKS_PASSED');
  assert.equal(result.sourceCoverage, '6/6');
  assert.equal(result.humanReviewCoverage, '6/6');
});

test('stale source link check cannot count toward release coverage', () => {
  const { status, audit: result } = audit(daysAgo(181), daysAgo(181));
  assert.equal(status, 1);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.sourceCoverage, '0/6');
  assert.equal(result.humanReviewCoverage, '0/6');
  assert.equal(result.issues.filter(x => x.startsWith('stale_source_check:')).length, 6);
});

test('fresh source link does not excuse stale human legal review', () => {
  const { status, audit: result } = audit(daysAgo(1), daysAgo(181));
  assert.equal(status, 1);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.sourceCoverage, '6/6');
  assert.equal(result.humanReviewCoverage, '0/6');
  assert.equal(result.issues.filter(x => x.startsWith('stale_human_legal_review:')).length, 6);
});
