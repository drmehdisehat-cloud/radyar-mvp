'use strict';
// Synthetic fixtures: never assert that the actual repository is release-ready.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const gate = path.resolve(__dirname, '../scripts/check-v1-readiness.cjs');
const topics = ['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh'];
function fixture(complete) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-release-gate-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  const source = complete ? `,source:{title:'قانون ساختگی',url:'https://qavanin.ir/Law/TreeText/?IDS=1',checked:'2026-10-21',legalReview:{effectiveDate:'2020-01-01',reviewedAt:'2026-10-21',reviewer:'Synthetic reviewer',amendmentStatus:'checked-current'}}` : '';
  fs.writeFileSync(path.join(dir, 'flows.js'),
    `const flows={${topics.map(id => `${id}:{title:'Synthetic'${source}}`).join(',')}};`);
  fs.writeFileSync(path.join(dir, 'export.js'),
    'function safeLawSource(source){return source.url.startsWith("https://qavanin.ir/");}\n' +
    'function validReviewDate(date){return /^\\d{4}-\\d{2}-\\d{2}$/.test(date);}\n');
  fs.writeFileSync(path.join(dir, 'docs/V1-RELEASE-GATES.md'),
    complete ? '- [x] Synthetic approval recorded\n' : '- [ ] Synthetic review still required\n');
  return dir;
}
function run(dir, enforce) {
  return spawnSync(process.execPath, [gate, '--root', dir, ...(enforce ? ['--enforce'] : [])], { encoding: 'utf8' });
}
test('audit mode reports blockers without breaking development CI', () => {
  const dir = fixture(false);
  try {
    const result = run(dir, false);
    assert.equal(result.status, 0, result.stderr);
    const audit = JSON.parse(result.stdout);
    assert.equal(audit.status, 'NOT_READY');
    assert.equal(audit.sourceCoverage, '0/6');
    assert.equal(audit.uncheckedGates, 1);
    assert.equal(audit.issues.filter(x => x.startsWith('missing_legal_source:')).length, 6);
    assert.equal(run(dir, true).status, 1, 'release enforcement must fail closed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('complete synthetic evidence passes the mechanical gate only', () => {
  const dir = fixture(true);
  try {
    const result = run(dir, true);
    assert.equal(result.status, 0, result.stderr);
    const audit = JSON.parse(result.stdout);
    assert.equal(audit.status, 'EVIDENCE_CHECKS_PASSED');
    assert.equal(audit.humanReviewCoverage, '6/6');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('release gate rejects inconsistent legal-review chronology', () => {
  const variants = [
    ["effectiveDate:'2020-01-01'", "effectiveDate:'2026-10-22'"],
    ["reviewedAt:'2026-10-21'", "reviewedAt:'2026-10-22'"],
  ];
  for (const [from, to] of variants) {
    const dir = fixture(true);
    try {
      const file = path.join(dir, 'flows.js');
      const original = fs.readFileSync(file, 'utf8');
      assert.ok(original.includes(from), 'fixture must contain expected review date');
      fs.writeFileSync(file, original.replaceAll(from, to));
      const result = run(dir, true);
      assert.equal(result.status, 1, 'inconsistent dates must block release');
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.status, 'NOT_READY');
      assert.equal(audit.humanReviewCoverage, '0/6');
      assert.equal(audit.issues.filter(x =>
        x.startsWith('inconsistent_legal_review_dates:')).length, 6);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
