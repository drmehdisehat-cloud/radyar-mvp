'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function candidate(lead) {
  return { topic: 'check', status: 'research-only', releaseSourceEligible: false,
    legalConclusionPermitted: false, amendments: [{ label: '1403',
      independentPrimaryAmendmentTextVerified: false,
      officialGazetteNumber: '23097', officialGazettePublicationDate: '1403/04/23',
      effectiveDate: '1403/05/07', transitionalApplicabilityVerified: true,
      humanReviewer: 'Example reviewer', humanReviewedAt: '2026-10-28',
      candidateInstrument: { candidatePrimaryTextRetrieved: true,
      candidatePrimaryDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=634882870797924421',
        ...(lead === undefined ? {} : { publicationResearchLead: lead }),
        primaryTextObservation: { url: 'https://qavanin.ir/Law/TreeText/?IDS=634882870797924421',
          sourceType: 'official-qavanin-portal-consolidated-text',
          observedAt: '2026-10-28', subsequentAmendmentsChecked: true } } }] };
}

test('missing candidate research lead never counts as gazette or commencement verification', () => {
  const report = audit(candidate(undefined));
  assert.deepEqual(report.instruments[0].missingEvidence,
    ['primary_official_gazette', 'verified_effective_date']);
});

test('non-boolean research lead flags do not count as verified', () => {
  const report = audit(candidate({ primaryGazetteIssueRetrieved: 'true',
    effectiveDateIndependentlyVerified: 1 }));
  assert.deepEqual(report.instruments[0].missingEvidence,
    ['primary_official_gazette', 'verified_effective_date']);
});

test('unverified candidate evidence cannot authorize release even when dates are filled', () => {
  const report = audit({ ...candidate(undefined), releaseSourceEligible: true,
    legalConclusionPermitted: true });
  assert.equal(report.status, 'INCONSISTENT_EVIDENCE');
  assert.ok(report.errors.includes('unsubstantiated_release_source'));
  assert.ok(report.errors.includes('unsubstantiated_legal_conclusion'));
});
