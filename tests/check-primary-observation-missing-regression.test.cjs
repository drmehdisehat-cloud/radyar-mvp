'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function matrix(observation) {
  return {
    topic: 'check', status: 'research-only',
    releaseSourceEligible: false, legalConclusionPermitted: false,
    amendments: [{
      label: '1403',
      independentPrimaryAmendmentTextVerified: false,
      officialGazetteNumber: null,
      officialGazettePublicationDate: null,
      effectiveDate: null,
      transitionalApplicabilityVerified: false,
      humanReviewer: null, humanReviewedAt: null,
      candidateInstrument: {
        candidatePrimaryTextRetrieved: true,
        ...(observation === undefined ? {} : { primaryTextObservation: observation }),
      },
    }],
  };
}

test('missing primary-text observation cannot clear later-amendment research gap', () => {
  const result = audit(matrix(undefined));
  assert.equal(result.status, 'RESEARCH_ONLY');
  assert.ok(result.instruments[0].missingEvidence.includes('subsequent_amendments'));
});

test('malformed or unverified observation cannot clear later-amendment gap', () => {
  for (const observation of [null, {}, { subsequentAmendmentsChecked: 'true' },
    { subsequentAmendmentsChecked: 1 }, { subsequentAmendmentsChecked: false }]) {
    const result = audit(matrix(observation));
    assert.ok(result.instruments[0].missingEvidence.includes('subsequent_amendments'));
  }
});

test('explicit boolean verification alone clears only the later-amendment gap', () => {
  const result = audit(matrix({ subsequentAmendmentsChecked: true }));
  assert.equal(result.status, 'RESEARCH_ONLY');
  assert.ok(!result.instruments[0].missingEvidence.includes('subsequent_amendments'));
  assert.ok(result.instruments[0].missingEvidence.includes('primary_official_gazette'));
  assert.ok(result.instruments[0].missingEvidence.includes('verified_effective_date'));
  assert.ok(result.instruments[0].missingEvidence.includes('human_legal_signoff'));
});
