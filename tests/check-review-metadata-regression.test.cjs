'use strict';
// Synthetic data only: evidence metadata is not independent human approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function matrix(reviewer, reviewedAt) {
  return {
    topic: 'check', status: 'research-only',
    releaseSourceEligible: false, legalConclusionPermitted: false,
    amendments: [{
      label: 'synthetic-only',
      independentPrimaryAmendmentTextVerified: true,
      officialGazetteNumber: 'TEST-ONLY',
      officialGazettePublicationDate: '1400/01/01',
      effectiveDate: '1400/01/01',
      transitionalApplicabilityVerified: true,
      humanReviewer: reviewer,
      humanReviewedAt: reviewedAt
    }]
  };
}

test('blank, placeholder and non-string reviewers leave a human sign-off gap', () => {
  for (const reviewer of ['   ', 'TBD', 'ＰＥＮＤＩＮＧ', 'نامشخص', 'بازبین فرضی',
                          123, true, 'Test', 'A\u200Bli']) {
    const result = audit(matrix(reviewer, '2026-10-28'));
    assert.ok(result.instruments[0].missingEvidence.includes('human_legal_signoff'),
      String(reviewer));
    assert.equal(result.status, 'RESEARCH_ONLY');
  }
});

test('invalid, future, and non-string review dates leave a sign-off gap', () => {
  for (const date of ['', '2026-02-30', '2026-13-01', '2099-01-01',
                      '1403/04/01', true, 20261028]) {
    const result = audit(matrix('Synthetic Reviewer', date));
    assert.ok(result.instruments[0].missingEvidence.includes('human_legal_signoff'),
      String(date));
  }
});

test('well-shaped synthetic metadata is still research-only and cannot authorize release', () => {
  const result = audit(matrix('Synthetic Reviewer', '2026-10-28'));
  assert.deepEqual(result.instruments[0].missingEvidence, ['primary_official_gazette']);
  assert.equal(result.status, 'RESEARCH_ONLY');
  assert.deepEqual(result.errors, []);
});
