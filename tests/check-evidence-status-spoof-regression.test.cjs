'use strict';
// Synthetic-only regression: a research inventory cannot approve legal release.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function completeSyntheticMatrix(status, releaseSourceEligible, legalConclusionPermitted) {
  return {
    topic: 'check', status, releaseSourceEligible, legalConclusionPermitted,
    amendments: [{
      label: 'synthetic-only', instrumentType: 'synthetic-test-instrument',
      independentPrimaryAmendmentTextVerified: true,
      officialGazetteNumber: 'TEST-ONLY',
      officialGazettePublicationDate: '1400/01/01',
      effectiveDate: '1400/01/01',
      transitionalApplicabilityVerified: true,
      humanReviewer: 'Synthetic Reviewer',
      humanReviewedAt: '2026-10-28'
    }]
  };
}

test('spoofed verified status cannot authorize a complete-looking research inventory', () => {
  const report = audit(completeSyntheticMatrix('verified', true, true));
  assert.deepEqual(report.instruments[0].missingEvidence, ['primary_official_gazette']);
  assert.equal(report.status, 'INCONSISTENT_EVIDENCE');
  assert.ok(report.errors.includes('invalid_research_status'));
  assert.ok(report.errors.includes('research_only_conflicts_with_release_flags'));
});

test('spoofed status is rejected even with explicitly blocked release flags', () => {
  for (const status of ['verified', 'approved', null, undefined]) {
    const report = audit(completeSyntheticMatrix(status, false, false));
    assert.equal(report.status, 'INCONSISTENT_EVIDENCE', String(status));
    assert.ok(report.errors.includes('invalid_research_status'), String(status));
  }
});

test('research-only matrix stays non-authorizing, regardless of apparent completeness', () => {
  const blocked = audit(completeSyntheticMatrix('research-only', false, false));
  assert.equal(blocked.status, 'RESEARCH_ONLY');
  assert.deepEqual(blocked.errors, []);

  const inconsistent = audit(completeSyntheticMatrix('research-only', true, true));
  assert.equal(inconsistent.status, 'INCONSISTENT_EVIDENCE');
  assert.ok(inconsistent.errors.includes('research_only_conflicts_with_release_flags'));
});
