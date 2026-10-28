'use strict';
// Synthetic tampering tests: malformed portal metadata cannot silently pass
// research inventory checks. No actual legal effective date is asserted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { audit } = require('../scripts/audit-check-evidence.cjs');

const matrix = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../docs/check-amendment-effective-date-matrix.json'), 'utf8'));
function check1403(input) {
  const result = audit(input);
  assert.equal(result.status, 'RESEARCH_ONLY');
  const row = result.instruments.find(item => item.label === '1403');
  assert.ok(row, 'the 1403 research instrument must be present');
  return row.missingEvidence;
}
function tamper(field, value) {
  const copy = structuredClone(matrix);
  const item = copy.amendments.find(item => item.label === '1403');
  item.candidateInstrument.primaryMetadataObservation[field] = value;
  return check1403(copy);
}
test('valid portal date shapes do not create a false malformed-date warning', () => {
  const gaps = check1403(matrix);
  assert.ok(!gaps.includes('invalid_primary_metadata_date'));
  assert.ok(gaps.includes('effective_date_source_conflict'));
});
test('malformed official gazette date is visible and keeps gazette unverified', () => {
  for (const value of ['1403/13/01', '1403/04/32', '', null]) {
    const gaps = tamper('officialGazetteDateShown', value);
    assert.ok(gaps.includes('invalid_primary_metadata_date'), String(value));
    assert.ok(gaps.includes('primary_official_gazette'), String(value));
  }
});
test('malformed commencement date is visible and keeps effective date unverified', () => {
  for (const value of ['1403/00/08', '1403/05/40', 'not-a-date', null]) {
    const gaps = tamper('effectiveDateShown', value);
    assert.ok(gaps.includes('invalid_primary_metadata_date'), String(value));
    assert.ok(gaps.includes('verified_effective_date'), String(value));
  }
});
