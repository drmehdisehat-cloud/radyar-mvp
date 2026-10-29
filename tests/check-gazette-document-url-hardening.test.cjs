'use strict';
// Synthetic-only regression: a generic rrk.ir page is not a gazette issue.
// Passing a URL shape check is NOT proof of publication or legal effect.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function evidence(url) {
  const matrix = {
    topic: 'check', status: 'research-only',
    releaseSourceEligible: false, legalConclusionPermitted: false,
    amendments: [{
      label: 'synthetic-only', officialGazetteNumber: '23097',
      officialGazettePublicationDate: '1403/04/23',
      effectiveDate: null, transitionalApplicabilityVerified: false,
      independentPrimaryAmendmentTextVerified: false,
      humanReviewer: null, humanReviewedAt: null,
      candidateInstrument: {
        publicationResearchLead: {
          primaryGazetteIssueRetrieved: true,
          primaryGazetteObservation: {
            sourceType: 'official-gazette-primary-issue',
            url, issueNumber: '23097', publicationDate: '1403/04/23',
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

test('generic pages and unusual URL authorities cannot impersonate gazette documents', () => {
  const urls = [
    'https://rrk.ir/robots.txt',
    'https://rrk.ir/favicon.ico',
    'https://rrk.ir/login',
    'https://rrk.ir/search',
    'https://rrk.ir/ords',
    'https://rrk.ir:8443/ords/r/rrs/synthetic-issue-23097',
    'https://rrk.ir/ords/r/rrs/synthetic-issue-23097#unverified'
  ];
  for (const url of urls) {
    assert.ok(evidence(url).includes('primary_official_gazette'), url);
  }
});

test('a specific-looking official route clears only the URL-shape gap', () => {
  const gaps = evidence('https://rrk.ir/ords/r/rrs/synthetic-issue-23097');
  assert.ok(!gaps.includes('primary_official_gazette'));
  for (const code of ['independent_primary_instrument', 'verified_effective_date',
    'transitional_applicability', 'human_legal_signoff']) {
    assert.ok(gaps.includes(code), code);
  }
});
