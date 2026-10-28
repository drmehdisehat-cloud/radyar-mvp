'use strict';
// Synthetic-only regression: a bare "retrieved" flag cannot certify a primary source.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

const url = 'https://qavanin.ir/Law/TreeText/?IDS=634882870797924421';
function record(overrides = {}) {
  const candidateInstrument = {
    candidatePrimaryTextRetrieved: true,
    candidatePrimaryDocumentUrl: url,
    primaryTextObservation: {
      url, sourceType: 'official-qavanin-portal-consolidated-text',
      observedAt: '2026-10-28', subsequentAmendmentsChecked: false
    },
    ...overrides
  };
  return { topic: 'check', status: 'research-only',
    releaseSourceEligible: false, legalConclusionPermitted: false,
    amendments: [{
      label: '1403', independentPrimaryAmendmentTextVerified: false,
      officialGazetteNumber: null, officialGazettePublicationDate: null,
      effectiveDate: null, transitionalApplicabilityVerified: false,
      humanReviewer: null, humanReviewedAt: null, candidateInstrument
    }] };
}
function gaps(overrides) { return audit(record(overrides)).instruments[0].missingEvidence; }

test('matching dated official-document observation counts only as a primary-text lead', () => {
  const missing = gaps();
  assert.ok(!missing.includes('independent_primary_instrument'));
  assert.ok(missing.includes('primary_official_gazette'));
  assert.ok(missing.includes('verified_effective_date'));
});

test('a bare retrieval flag or unbound observation cannot clear primary-text gap', () => {
  const cases = [
    { primaryTextObservation: undefined },
    { primaryTextObservation: { url, sourceType: 'official-qavanin-portal-consolidated-text' } },
    { candidatePrimaryDocumentUrl: 'https://example.org/Law/TreeText/?IDS=1' },
    { candidatePrimaryDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=0' },
    { primaryTextObservation: { url: url + '9', sourceType: 'official-qavanin-portal-consolidated-text', observedAt: '2026-10-28' } },
    { primaryTextObservation: { url, sourceType: 'secondary-article', observedAt: '2026-10-28' } },
    { primaryTextObservation: { url, sourceType: 'official-qavanin-portal-consolidated-text', observedAt: '2026-02-30' } },
    { primaryTextObservation: { url, sourceType: 'official-qavanin-portal-consolidated-text', observedAt: '2099-01-01' } },
    { candidatePrimaryTextRetrieved: 'true' }
  ];
  for (const item of cases) {
    assert.ok(gaps(item).includes('independent_primary_instrument'), JSON.stringify(item));
  }
});

test('committed 1403 research record retains all publication and review blockers', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const matrix = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../docs/check-amendment-effective-date-matrix.json'), 'utf8'));
  const report = audit(matrix);
  assert.equal(report.status, 'RESEARCH_ONLY');
  const record1403 = report.instruments.find(item => item.label === '1403');
  assert.ok(record1403);
  assert.ok(!record1403.missingEvidence.includes('independent_primary_instrument'));
  for (const gap of ['primary_official_gazette', 'verified_effective_date',
    'transitional_applicability', 'subsequent_amendments', 'human_legal_signoff']) {
    assert.ok(record1403.missingEvidence.includes(gap), gap);
  }
});
