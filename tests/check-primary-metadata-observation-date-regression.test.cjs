'use strict';
// Synthetic evidence only: official-portal metadata needs a dated observation.
// This is a structural provenance test, NOT authentication of a legal source.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function gaps(observedAt) {
  const primaryUrl = 'https://qavanin.ir/Law/TreeText/?IDS=634882870797924421';
  const metadata = {
    sourceType: 'official-qavanin-portal-instrument-metadata',
    url: 'https://qavanin.ir/Law/Attribute/?IDS=634882870797924421',
    officialGazetteNumberShown: '23097',
    officialGazetteDateShown: '1403/04/23',
    effectiveDateShown: '1403/05/08',
  };
  if (observedAt !== undefined) metadata.observedAt = observedAt;
  const matrix = {
    topic: 'check', status: 'research-only',
    releaseSourceEligible: false, legalConclusionPermitted: false,
    amendments: [{
      label: 'synthetic-metadata-date',
      officialGazetteNumber: '23097',
      officialGazettePublicationDate: '1403/04/23',
      effectiveDate: '1403/05/08',
      independentPrimaryAmendmentTextVerified: false,
      transitionalApplicabilityVerified: false,
      humanReviewer: null, humanReviewedAt: null,
      candidateInstrument: {
        candidatePrimaryDocumentUrl: primaryUrl,
        primaryMetadataObservation: metadata,
        publicationResearchLead: {
          effectiveDateIndependentlyVerified: true,
          reportedEffectiveDate: '1403/05/08',
          primaryGazetteIssueRetrieved: true,
          primaryGazetteObservation: {
            sourceType: 'official-gazette-primary-issue',
            url: 'https://rrk.ir/ords/r/rrs/synthetic-issue-23097',
            issueNumber: '23097',
            publicationDate: '1403/04/23',
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

test('dated, structurally bound portal metadata remains a research lead only', () => {
  const missing = gaps('2026-10-28');
  assert.ok(!missing.includes('unbound_primary_metadata_observation'));
  assert.ok(!missing.includes('verified_effective_date'));
  assert.ok(missing.includes('human_legal_signoff'));
});

test('missing, impossible and future observation dates cannot clear source gaps', () => {
  for (const observedAt of [undefined, '', '2026/10/28', '2026-02-30',
    '2099-01-01', 'not-observed']) {
    const missing = gaps(observedAt);
    for (const required of ['unbound_primary_metadata_observation',
      'primary_official_gazette', 'verified_effective_date']) {
      assert.ok(missing.includes(required),
        String(observedAt) + ': expected ' + required);
    }
  }
});
