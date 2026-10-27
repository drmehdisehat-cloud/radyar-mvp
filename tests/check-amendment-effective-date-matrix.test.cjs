'use strict';
// Research evidence guard: an amendment label is not an effective date.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const matrix = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-amendment-effective-date-matrix.json'), 'utf8'));
const handoff = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-source-handoff-20261026.json'), 'utf8'));

test('cheque amendments are tracked as research, not approved release evidence', () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.topic, 'check');
  assert.equal(matrix.status, 'research-only');
  assert.equal(matrix.releaseSourceEligible, false);
  assert.equal(matrix.legalConclusionPermitted, false);
  assert.equal(matrix.primaryConsolidatedLawUrl, handoff.officialTextUrl);
  assert.equal(matrix.originalLawMetadataUrl,
    handoff.originalLawMetadataObservation.officialAttributeUrl);
  assert.equal(matrix.originalLawEffectiveDateShown,
    handoff.originalLawMetadataObservation.originalEffectiveDateShown);
  assert.match(matrix.warning, /NOT independent proof/i);
});

test('1397, 1400 and 1403 amendment dates cannot masquerade as commencement dates', () => {
  assert.deepEqual(matrix.amendments.map(a => a.label), ['1397', '1400', '1403']);
  for (const amendment of matrix.amendments) {
    assert.equal(amendment.dateMeaning, 'article-amendment-label-only');
    assert.match(amendment.dateShownOnConsolidatedArticles, /^1[34]\d{2}\/\d{2}\/\d{2}$/);
    assert.ok(amendment.articleLabels.length >= 1);
    assert.ok(amendment.reviewTask.length > 40);
    assert.equal(amendment.independentPrimaryAmendmentTextVerified, false);
    assert.equal(amendment.transitionalApplicabilityVerified, false);
    for (const key of ['officialGazetteNumber', 'officialGazettePublicationDate',
      'effectiveDate', 'humanReviewer', 'humanReviewedAt']) {
      assert.equal(amendment[key], null, amendment.label + ':' + key);
    }
    assert.notEqual(amendment.dateShownOnConsolidatedArticles,
      matrix.originalLawEffectiveDateShown);
    for (const article of amendment.articleLabels) {
      assert.ok(handoff.officialTextObservation.amendmentDatesDisplayed.some(
        observed => observed.article === article &&
          observed.date === amendment.dateShownOnConsolidatedArticles),
      amendment.label + ':' + article + ' must have an observed primary-law label');
    }
  }
});

test('1403 article-7 monetary adjustment is not misclassified as a parliamentary act', () => {
  const byYear = Object.fromEntries(matrix.amendments.map(item => [item.label, item]));
  for (const year of ['1397', '1400']) {
    assert.equal(byYear[year].instrumentType, 'parliamentary-amending-act');
    assert.equal(byYear[year].instrumentIdentificationStatus, 'primary-instrument-unverified');
  }
  const adjustment = byYear['1403'];
  assert.equal(adjustment.instrumentType, 'executive-monetary-threshold-adjustment-candidate');
  assert.equal(adjustment.instrumentIdentificationStatus, 'secondary-corroborated-primary-unverified');
  assert.deepEqual(adjustment.articleLabels, ['7']);
  const candidate = adjustment.candidateInstrument;
  assert.equal(candidate.approvalDateReported, '1403/03/30');
  assert.equal(candidate.notificationDateReported, '1403/04/04');
  assert.equal(candidate.decisionNumberReported, '56261/ت62298هـ');
  assert.match(candidate.candidatePrimaryDocumentUrl,
    /^https:\/\/qavanin\.ir\/Law\/TreeText\/\?IDS=[1-9]\d*$/);
  assert.match(candidate.secondarySourceUrl, /^https:\/\/www\.ekhtebar\.ir\//);
  assert.equal(candidate.candidatePrimaryTextRetrieved, false);
  assert.equal(candidate.officialGazetteAndTemporalEffectVerified, false);
  assert.equal(candidate.approvedForLegalConclusions, false);
  assert.equal(adjustment.effectiveDate, null);
  assert.equal(adjustment.officialGazettePublicationDate, null);
  assert.equal(matrix.releaseSourceEligible, false);
  assert.equal(matrix.legalConclusionPermitted, false);
  assert.match(adjustment.reviewTask, /not classify this as a parliamentary amendment/i);
});
