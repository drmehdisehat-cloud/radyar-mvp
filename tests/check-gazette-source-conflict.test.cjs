'use strict';
// Synthetic claims only: portal metadata is not independent gazette evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { audit } = require('../scripts/audit-check-evidence.cjs');

const matrix = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../docs/check-amendment-effective-date-matrix.json'), 'utf8'));

function candidate() {
  const data = structuredClone(matrix);
  const item = data.amendments.find(row => row.label === '1403');
  item.candidateInstrument.publicationResearchLead.primaryGazetteIssueRetrieved = true;
  return { data, item };
}
function gaps(data) {
  return audit(data).instruments.find(row => row.label === '1403').missingEvidence;
}

test('different claimed gazette issue number is flagged despite positive research flag', () => {
  const { data, item } = candidate();
  item.officialGazetteNumber = '99999';
  item.officialGazettePublicationDate = '1403/04/23';
  const missing = gaps(data);
  assert.ok(missing.includes('gazette_source_conflict'));
  assert.ok(missing.includes('primary_official_gazette'));
  assert.equal(audit(data).status, 'RESEARCH_ONLY');
});

test('different claimed gazette publication date is flagged', () => {
  const { data, item } = candidate();
  item.officialGazetteNumber = '23097';
  item.officialGazettePublicationDate = '1403/04/24';
  const missing = gaps(data);
  assert.ok(missing.includes('gazette_source_conflict'));
  assert.ok(missing.includes('primary_official_gazette'));
});

test('matching metadata removes only the conflict, not other legal blockers', () => {
  const { data, item } = candidate();
  item.officialGazetteNumber = '23097';
  item.officialGazettePublicationDate = '1403/04/23';
  const missing = gaps(data);
  assert.ok(!missing.includes('gazette_source_conflict'));
  assert.ok(missing.includes('verified_effective_date'));
  assert.ok(missing.includes('transitional_applicability'));
  assert.equal(data.releaseSourceEligible, false);
});

test('missing claimed gazette fields remain unverified, not a fabricated conflict', () => {
  const missing = gaps(matrix);
  assert.ok(!missing.includes('gazette_source_conflict'));
  assert.ok(missing.includes('primary_official_gazette'));
});
