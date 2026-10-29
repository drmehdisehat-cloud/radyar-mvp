'use strict';
// Synthetic research records only. Malformed official-portal metadata must
// never be silently treated as compatible with a claimed gazette/commencement.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { audit } = require('../scripts/audit-check-evidence.cjs');

const original = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../docs/check-amendment-effective-date-matrix.json'), 'utf8'));

function gaps(patch = {}) {
  const matrix = structuredClone(original);
  const row = matrix.amendments.find(item => item.label === '1403');
  row.officialGazetteNumber = '23097';
  row.officialGazettePublicationDate = '1403/04/23';
  row.effectiveDate = '1403/05/08';
  const lead = row.candidateInstrument.publicationResearchLead;
  lead.primaryGazetteIssueRetrieved = true;
  lead.primaryGazetteObservation = {
    sourceType: 'official-gazette-primary-issue',
    url: 'https://rrk.ir/ords/r/rrs/synthetic-issue-23097',
    issueNumber: '23097', publicationDate: '1403/04/23',
    observedAt: '2026-10-28'
  };
  lead.reportedEffectiveDate = '1403/05/08';
  lead.effectiveDateIndependentlyVerified = true;
  Object.assign(row.candidateInstrument.primaryMetadataObservation, patch);
  const result = audit(matrix);
  assert.equal(result.status, 'RESEARCH_ONLY');
  assert.equal(matrix.releaseSourceEligible, false);
  return result.instruments.find(item => item.label === '1403').missingEvidence;
}

test('well-shaped matching portal metadata clears only structural date and issue gaps', () => {
  const missing = gaps();
  assert.ok(!missing.includes('primary_official_gazette'));
  assert.ok(!missing.includes('verified_effective_date'));
  assert.ok(missing.includes('human_legal_signoff'));
});

test('blank or malformed portal gazette number/date cannot silently clear gazette gap', () => {
  for (const patch of [
    { officialGazetteNumberShown: '' },
    { officialGazetteNumberShown: null },
    { officialGazetteDateShown: '1403/13/01' },
    { officialGazetteDateShown: '1403/07/31' },
    { officialGazetteDateShown: '' }
  ]) {
    const missing = gaps(patch);
    assert.ok(missing.includes('invalid_primary_metadata_gazette'), JSON.stringify(patch));
    assert.ok(missing.includes('primary_official_gazette'), JSON.stringify(patch));
  }
});

test('blank or malformed portal execution date cannot silently clear commencement gap', () => {
  for (const patch of [
    { effectiveDateShown: '' },
    { effectiveDateShown: '1403/13/01' },
    { effectiveDateShown: '1403/07/31' },
    { effectiveDateShown: null }
  ]) {
    const missing = gaps(patch);
    assert.ok(missing.includes('invalid_primary_metadata_effective_date'), JSON.stringify(patch));
    assert.ok(missing.includes('verified_effective_date'), JSON.stringify(patch));
  }
});
