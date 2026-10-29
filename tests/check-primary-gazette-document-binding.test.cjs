'use strict';
// Synthetic source-provenance checks. A matching URL/number/date is not
// independent proof of publication, legal effect, or release readiness.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function fixture() {
  return {
    topic: 'check', status: 'research-only', releaseSourceEligible: false,
    legalConclusionPermitted: false,
    amendments: [{
      label: '1403', instrumentType: 'executive-monetary-threshold-adjustment-candidate',
      officialGazetteNumber: '23097',
      officialGazettePublicationDate: '1403/04/23',
      effectiveDate: null, transitionalApplicabilityVerified: false,
      independentPrimaryAmendmentTextVerified: false,
      humanReviewer: null, humanReviewedAt: null,
      candidateInstrument: {
        publicationResearchLead: { primaryGazetteIssueRetrieved: true }
      }
    }]
  };
}
function missing(matrix) {
  const report = audit(matrix);
  assert.equal(report.status, 'RESEARCH_ONLY');
  return report.instruments[0].missingEvidence;
}
function observed() {
  return {
    sourceType: 'official-gazette-primary-issue',
    url: 'https://rrk.ir/ords/r/rrs/synthetic-issue-23097',
    issueNumber: '23097',
    publicationDate: '1403/04/23',
    observedAt: '2026-10-28'
  };
}

test('a checked primary-gazette flag and typed issue/date alone remain unverified', () => {
  const data = fixture();
  assert.ok(missing(data).includes('primary_official_gazette'));
});

test('secondary URL, homepage and mismatched issue metadata cannot clear gazette gap', () => {
  const variants = [
    { url: 'https://example.com/gazette/23097' },
    { url: 'https://rrk.ir/' },
    { url: 'https://rrk.ir.evil.example/issue/23097' },
    { url: 'http://rrk.ir/issue/23097' },
    { issueNumber: '23098' },
    { publicationDate: '1403/04/24' },
    { observedAt: '2026-02-30' },
    { observedAt: '2099-01-01' },
    { sourceType: 'secondary-report' }
  ];
  for (const patch of variants) {
    const data = fixture();
    data.amendments[0].candidateInstrument.publicationResearchLead.primaryGazetteObservation =
      { ...observed(), ...patch };
    assert.ok(missing(data).includes('primary_official_gazette'), JSON.stringify(patch));
  }
});

test('a bound primary gazette observation clears only its structural gap', () => {
  const data = fixture();
  data.amendments[0].candidateInstrument.publicationResearchLead.primaryGazetteObservation = observed();
  const gaps = missing(data);
  assert.ok(!gaps.includes('primary_official_gazette'));
  assert.ok(gaps.includes('independent_primary_instrument'));
  assert.ok(gaps.includes('verified_effective_date'));
  assert.ok(gaps.includes('transitional_applicability'));
  assert.ok(gaps.includes('human_legal_signoff'));
  assert.equal(data.releaseSourceEligible, false);
});
