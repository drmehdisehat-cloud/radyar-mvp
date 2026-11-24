'use strict';
// Research-only regression: an official portal metadata date and a secondary
// commencement lead conflict. Neither is a certified effective date.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { audit } = require('../scripts/audit-check-evidence.cjs');

const matrix = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../docs/check-amendment-effective-date-matrix.json'), 'utf8'));

function amendment(data) {
  return data.amendments.find(item => item.label === '1403');
}

test('official portal metadata conflict is recorded without legal release approval', () => {
  const item = amendment(matrix);
  const candidate = item.candidateInstrument;
  const metadata = candidate.primaryMetadataObservation;
  assert.equal(metadata.url, 'https://qavanin.ir/Law/Attribute/?IDS=634882870797924421');
  assert.equal(metadata.sourceType, 'official-qavanin-portal-instrument-metadata');
  assert.equal(metadata.officialGazetteNumberShown, '23097');
  assert.equal(metadata.officialGazetteDateShown, '1403/04/23');
  assert.equal(metadata.effectiveDateShown, '1403/05/08');
  assert.equal(candidate.publicationResearchLead.reportedEffectiveDate, '1403/05/07');
  assert.equal(metadata.gazetteIssueIndependentlyRetrieved, false);
  assert.equal(metadata.temporalApplicabilityVerified, false);
  assert.equal(item.effectiveDate, null);
  const report = audit(matrix);
  assert.equal(report.status, 'RESEARCH_ONLY');
  assert.ok(report.instruments.find(i => i.label === '1403')
    .missingEvidence.includes('effective_date_source_conflict'));
  assert.equal(matrix.releaseSourceEligible, false);
  assert.equal(matrix.legalConclusionPermitted, false);
});

test('synthetic claim of verified secondary date cannot hide primary metadata conflict', () => {
  const synthetic = structuredClone(matrix);
  const item = amendment(synthetic);
  item.officialGazetteNumber = '23097';
  item.officialGazettePublicationDate = '1403/04/23';
  item.effectiveDate = '1403/05/07';
  item.candidateInstrument.publicationResearchLead.effectiveDateIndependentlyVerified = true;
  const gaps = audit(synthetic).instruments.find(i => i.label === '1403').missingEvidence;
  assert.ok(gaps.includes('effective_date_source_conflict'));
  assert.ok(gaps.includes('verified_effective_date'));
});

test('matching research dates clear conflict marker, not independent verification', () => {
  const synthetic = structuredClone(matrix);
  const item = amendment(synthetic);
  item.candidateInstrument.publicationResearchLead.reportedEffectiveDate = '1403/05/08';
  const report = audit(synthetic);
  const gaps = report.instruments.find(i => i.label === '1403').missingEvidence;
  assert.ok(!gaps.includes('effective_date_source_conflict'));
  assert.ok(gaps.includes('verified_effective_date'));
  assert.ok(gaps.includes('primary_official_gazette'));
  assert.equal(report.status, 'RESEARCH_ONLY');
});
