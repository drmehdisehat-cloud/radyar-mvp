'use strict';
// Synthetic mutations only: portal metadata is a research observation, not gazette proof.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { audit } = require('../scripts/audit-check-evidence.cjs');

const matrix = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../docs/check-amendment-effective-date-matrix.json'), 'utf8'));

function gaps(mutate) {
  const data = structuredClone(matrix);
  const item = data.amendments.find(row => row.label === '1403');
  item.officialGazetteNumber = '23097';
  item.officialGazettePublicationDate = '1403/04/23';
  item.effectiveDate = '1403/05/08';
  item.candidateInstrument.publicationResearchLead.primaryGazetteIssueRetrieved = true;
  item.candidateInstrument.publicationResearchLead.effectiveDateIndependentlyVerified = true;
  mutate(item.candidateInstrument);
  const report = audit(data);
  assert.equal(report.status, 'RESEARCH_ONLY');
  assert.equal(data.releaseSourceEligible, false);
  return report.instruments.find(row => row.label === '1403').missingEvidence;
}

test('a mismatched official metadata URL cannot silently erase source conflicts', () => {
  const missing = gaps(candidate => {
    candidate.primaryMetadataObservation.url =
      'https://qavanin.ir/Law/Attribute/?IDS=999';
  });
  for (const code of ['unbound_primary_metadata_observation',
    'primary_official_gazette', 'verified_effective_date']) {
    assert.ok(missing.includes(code), code);
  }
});

test('an altered metadata source type remains a research blocker', () => {
  const missing = gaps(candidate => {
    candidate.primaryMetadataObservation.sourceType = 'secondary-article';
  });
  assert.ok(missing.includes('unbound_primary_metadata_observation'));
  assert.ok(missing.includes('primary_official_gazette'));
  assert.ok(missing.includes('verified_effective_date'));
});

test('a correctly bound observation has no binding error', () => {
  const missing = gaps(() => {});
  assert.ok(!missing.includes('unbound_primary_metadata_observation'));
  assert.ok(missing.includes('effective_date_source_conflict'));
});

test('an absent metadata observation does not claim a conflict', () => {
  const missing = gaps(candidate => { delete candidate.primaryMetadataObservation; });
  assert.ok(!missing.includes('unbound_primary_metadata_observation'));
  assert.ok(!missing.includes('effective_date_source_conflict'));
});
