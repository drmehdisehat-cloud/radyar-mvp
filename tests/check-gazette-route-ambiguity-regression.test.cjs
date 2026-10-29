'use strict';
// Synthetic URL-shape regression only. This cannot authenticate a gazette issue
// or authorize any legal conclusion or deployment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function gapsFor(url) {
  const matrix = {
    topic: 'check', status: 'research-only', releaseSourceEligible: false,
    legalConclusionPermitted: false,
    amendments: [{
      label: 'synthetic-route', officialGazetteNumber: '23097',
      officialGazettePublicationDate: '1403/04/23',
      effectiveDate: null, transitionalApplicabilityVerified: false,
      independentPrimaryAmendmentTextVerified: false,
      humanReviewer: null, humanReviewedAt: null,
      candidateInstrument: {
        publicationResearchLead: {
          primaryGazetteIssueRetrieved: true,
          primaryGazetteObservation: {
            sourceType: 'official-gazette-primary-issue', url,
            issueNumber: '23097', publicationDate: '1403/04/23',
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

test('generic four-segment routes must not count as specific gazette observations', () => {
  for (const url of [
    'https://rrk.ir/a/b/c/d',
    'https://rrk.ir/ords/r/other/synthetic-issue-23097',
    'https://rrk.ir/ords/r/rrs/synthetic-issue-23097?redirect=https%3A%2F%2Fevil.example',
    'https://rrk.ir/ords/r/rrs/synthetic-issue-23097?view=1',
    'https://rrk.ir/ords/r/rrs/synthetic%2Fissue-23097',
    'https://rrk.ir/ords/r/rrs/synthetic%5Cissue-23097'
  ]) {
    assert.ok(gapsFor(url).includes('primary_official_gazette'), url);
  }
});

test('a query-free, issue-shaped route clears only the structural gap', () => {
  const gaps = gapsFor('https://rrk.ir/ords/r/rrs/synthetic-issue-23097');
  assert.ok(!gaps.includes('primary_official_gazette'));
  for (const code of ['independent_primary_instrument', 'verified_effective_date',
    'transitional_applicability', 'human_legal_signoff']) {
    assert.ok(gaps.includes(code), code);
  }
});
