'use strict';
// Synthetic-only URL canonicalization regression. A plausible URL is never
// independent proof that an official gazette issue was actually retrieved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function gazetteGap(url) {
  const matrix = {
    topic: 'check', status: 'research-only',
    releaseSourceEligible: false, legalConclusionPermitted: false,
    amendments: [{
      label: 'synthetic-canonicalization', officialGazetteNumber: '23097',
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
  return result.instruments[0].missingEvidence.includes('primary_official_gazette');
}

test('encoded controls, invisible characters, and normalized dot segments cannot impersonate gazette documents', () => {
  for (const url of [
    'https://rrk.ir/ords/r/rrs/synthetic%0Aissue-23097',
    'https://rrk.ir/ords/r/rrs/synthetic%E2%80%8Bissue-23097',
    'https://rrk.ir/ords/r/rrs/temp/%2e%2e/synthetic-issue-23097',
    'https://rrk.ir/ords/r/rrs/temp/../synthetic-issue-23097',
    'https://rrk.ir/ords//r/rrs/synthetic-issue-23097'
  ]) {
    assert.equal(gazetteGap(url), true, url);
  }
});

test('plain synthetic issue-shaped URL is still only a structural research lead', () => {
  assert.equal(gazetteGap('https://rrk.ir/ords/r/rrs/synthetic-issue-23097'), false);
});
