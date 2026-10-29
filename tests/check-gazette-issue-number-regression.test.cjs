'use strict';
// Synthetic evidence only. Numeric formatting cannot authenticate a gazette.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function gaps(issueNumber) {
  const matrix = {
    topic: 'check', status: 'research-only',
    releaseSourceEligible: false, legalConclusionPermitted: false,
    amendments: [{
      label: 'synthetic-number', officialGazetteNumber: issueNumber,
      officialGazettePublicationDate: '1403/04/23',
      effectiveDate: null, transitionalApplicabilityVerified: false,
      independentPrimaryAmendmentTextVerified: false,
      humanReviewer: null, humanReviewedAt: null,
      candidateInstrument: {
        publicationResearchLead: {
          primaryGazetteIssueRetrieved: true,
          primaryGazetteObservation: {
            sourceType: 'official-gazette-primary-issue',
            url: 'https://rrk.ir/ords/r/rrs/synthetic-issue-23097',
            issueNumber, publicationDate: '1403/04/23',
            observedAt: '2026-10-28'
          }
        }
      }
    }]
  };
  const result = audit(matrix);
  assert.equal(result.status, 'RESEARCH_ONLY');
  return result.instruments[0].missingEvidence;
}

test('placeholder, zero and nonnumeric issue identifiers retain gazette evidence gap', () => {
  for (const issue of [
    'unknown', 'not published', 'N/A', '۲۳۰۹۷', '23 097',
    '23097 ', ' 23097', '0', '00023097', '-23097', '23097/1403',
    '', null, 23097
  ]) {
    assert.ok(gaps(issue).includes('primary_official_gazette'), String(issue));
  }
});

test('numeric issue shape is only a research lead, never legal clearance', () => {
  const missing = gaps('23097');
  assert.ok(!missing.includes('primary_official_gazette'));
  for (const required of [
    'independent_primary_instrument', 'verified_effective_date',
    'transitional_applicability', 'human_legal_signoff'
  ]) assert.ok(missing.includes(required), required);
});
