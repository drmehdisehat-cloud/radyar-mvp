'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');
const fs = require('node:fs');
const path = require('node:path');

const fixture = {
  topic: 'check', status: 'research-only', releaseSourceEligible: false,
  legalConclusionPermitted: false,
  amendments: [{ label: '1403', instrumentType: 'executive-monetary-threshold-adjustment-candidate',
    independentPrimaryAmendmentTextVerified: false, officialGazetteNumber: null,
    officialGazettePublicationDate: null, effectiveDate: null,
    transitionalApplicabilityVerified: false, humanReviewer: null, humanReviewedAt: null,
    candidateInstrument: { candidatePrimaryTextRetrieved: true,
      candidatePrimaryDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=634882870797924421',
      publicationResearchLead: { primaryGazetteIssueRetrieved: false,
        effectiveDateIndependentlyVerified: false },
      primaryTextObservation: { url: 'https://qavanin.ir/Law/TreeText/?IDS=634882870797924421',
          sourceType: 'official-qavanin-portal-consolidated-text',
          observedAt: '2026-10-28', subsequentAmendmentsChecked: false } } }]
};

test('1403 primary portal text does not erase gazette and temporal gaps', () => {
  const report = audit(fixture);
  assert.equal(report.status, 'RESEARCH_ONLY');
  assert.deepEqual(report.instruments[0].missingEvidence, [
    'primary_official_gazette', 'verified_effective_date',
    'transitional_applicability', 'subsequent_amendments', 'human_legal_signoff']);
});

test('research record cannot claim release or case-specific legal conclusions', () => {
  const report = audit({ ...fixture, releaseSourceEligible: true,
    legalConclusionPermitted: true });
  assert.equal(report.status, 'INCONSISTENT_EVIDENCE');
  assert.deepEqual(report.errors, ['unsubstantiated_release_source',
    'unsubstantiated_legal_conclusion', 'research_only_conflicts_with_release_flags']);
});

test('committed evidence stays research-only with concrete gaps for every instrument', () => {
  const matrix = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../docs/check-amendment-effective-date-matrix.json'), 'utf8'));
  const report = audit(matrix);
  assert.equal(report.status, 'RESEARCH_ONLY');
  assert.deepEqual(report.instruments.map(item => item.label), ['1397', '1400', '1403']);
  for (const item of report.instruments) {
    assert.ok(item.missingEvidence.includes('primary_official_gazette'), item.label);
    assert.ok(item.missingEvidence.includes('verified_effective_date'), item.label);
    assert.ok(item.missingEvidence.includes('human_legal_signoff'), item.label);
  }
});

test('invalid matrix never becomes ready evidence', () => {
  assert.equal(audit(null).status, 'INVALID_EVIDENCE');
  assert.equal(audit({ topic: 'check' }).status, 'INVALID_EVIDENCE');
  assert.equal(audit({ topic: 'check', amendments: [] }).status, 'INVALID_EVIDENCE');
  assert.equal(audit({ topic: 'check', amendments: [null] }).status, 'INVALID_EVIDENCE');
});
