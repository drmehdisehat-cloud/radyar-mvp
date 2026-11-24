'use strict';
// Secondary publication leads must never be promoted into verified legal effect.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const matrix = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/check-amendment-effective-date-matrix.json'), 'utf8'));

test('1403 cheque article-7 gazette lead remains unverified research', () => {
  const adjustment = matrix.amendments.find(item => item.label === '1403');
  assert.ok(adjustment);
  assert.equal(adjustment.instrumentType, 'executive-monetary-threshold-adjustment-candidate');
  const instrument = adjustment.candidateInstrument;
  const lead = instrument.publicationResearchLead;
  assert.equal(lead.checkedAt, '2026-10-27');
  assert.equal(lead.status, 'secondary-reported-gazette-unverified');
  assert.equal(lead.reportedOfficialGazetteNumber, '23097');
  assert.equal(lead.reportedOfficialGazetteDate, '1403/04/23');
  assert.equal(lead.reportedEffectiveDate, '1403/05/07');
  assert.ok(Array.isArray(lead.supportingSecondaryUrls));
  assert.ok(lead.supportingSecondaryUrls.length >= 2);
  for (const url of lead.supportingSecondaryUrls) {
    assert.match(url, /^https:\/\//);
  }
  assert.match(lead.warning, /secondary leads/i);
  assert.match(lead.warning, /commencement/i);
  assert.equal(lead.primaryGazetteIssueRetrieved, false);
  assert.equal(lead.appendixRow42PrimaryVerified, true);
  assert.equal(lead.effectiveDateIndependentlyVerified, false);
  assert.equal(instrument.candidatePrimaryTextRetrieved, true);
  assert.equal(instrument.primaryTextObservation.sourceType, 'official-qavanin-portal-consolidated-text');
  assert.equal(instrument.primaryTextObservation.thresholdsIRR.article7A, '780000000');
  assert.equal(instrument.primaryTextObservation.thresholdsIRR.article7BUpper, '3900000000');
  assert.equal(instrument.primaryTextObservation.legalCommencementVerified, false);
  assert.equal(instrument.officialGazetteAndTemporalEffectVerified, false);
  assert.equal(instrument.approvedForLegalConclusions, false);
  assert.equal(adjustment.officialGazetteNumber, null);
  assert.equal(adjustment.officialGazettePublicationDate, null);
  assert.equal(adjustment.effectiveDate, null);
  assert.equal(adjustment.humanReviewer, null);
  assert.equal(matrix.releaseSourceEligible, false);
  assert.equal(matrix.legalConclusionPermitted, false);
});
