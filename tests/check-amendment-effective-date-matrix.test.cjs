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
const recheck = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-qavanin-recheck-20261124.json'), 'utf8'));
const { audit } = require('../scripts/audit-check-evidence.cjs');

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
  assert.match(matrix.warning, /NOT independently prove/i);
});

test('1372 and later cheque amendment dates cannot masquerade as commencement dates', () => {
  assert.deepEqual(matrix.amendments.map(a => a.label), ['1372', '1397', '1400', '1403']);
  for (const amendment of matrix.amendments) {
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
    if (amendment.label === '1372') {
      assert.equal(amendment.dateMeaning, 'instrument-approval-date-only');
      assert.equal(amendment.dateShownOnConsolidatedArticles, '1372/08/11');
      assert.equal(recheck.sources.amendment1372.approvalDateShown, '1372/08/11');
      assert.equal(recheck.sources.amendment1372.guardianCouncilConfirmationDateShown, '1372/08/19');
      assert.equal(recheck.sources.amendment1372.textPageRendered, true);
      assert.equal(recheck.sources.amendment1372.metadataPageRendered, true);
      continue;
    }
    assert.equal(amendment.dateMeaning, 'article-amendment-label-only');
    const [year, month, day] = amendment.dateShownOnConsolidatedArticles.split('/');
    assert.equal(year, amendment.label);
    assert.equal(month.length, 2);
    assert.equal(day.length, 2);
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
  assert.equal(adjustment.instrumentIdentificationStatus, 'primary-portal-text-observed-gazette-unverified');
  assert.deepEqual(adjustment.articleLabels, ['7']);
  const candidate = adjustment.candidateInstrument;
  assert.equal(candidate.approvalDateReported, '1403/03/30');
  assert.equal(candidate.notificationDateReported, '1403/04/04');
  assert.equal(candidate.decisionNumberReported, '56261/ت62298هـ');
  assert.match(candidate.candidatePrimaryDocumentUrl,
    /^https:\/\/qavanin\.ir\/Law\/TreeText\/\?IDS=[1-9]\d*$/);
  assert.match(candidate.secondarySourceUrl, /^https:\/\/www\.ekhtebar\.ir\//);
  assert.equal(candidate.candidatePrimaryTextRetrieved, true);
  assert.equal(candidate.primaryTextObservation.sourceType, 'official-qavanin-portal-consolidated-text');
  assert.equal(candidate.primaryTextObservation.observedAt, '2026-10-28');
  assert.equal(candidate.primaryTextObservation.appendix, 'پیوست ۱، ردیف ۴۲، قانون صدور چک، ماده ۷');
  assert.deepEqual(candidate.primaryTextObservation.thresholdsIRR, {
    article7A: '780000000', article7BLower: '780000000',
    article7BUpper: '3900000000', article7C: '3900000000'
  });
  assert.equal(candidate.primaryTextObservation.officialGazettePublicationVerified, false);
  assert.equal(candidate.primaryTextObservation.legalCommencementVerified, false);
  assert.equal(candidate.primaryTextObservation.humanLegalReview, false);
  assert.equal(candidate.officialGazetteAndTemporalEffectVerified, false);
  assert.equal(candidate.approvedForLegalConclusions, false);
  assert.equal(adjustment.effectiveDate, null);
  assert.equal(adjustment.officialGazettePublicationDate, null);
  assert.equal(matrix.releaseSourceEligible, false);
  assert.equal(matrix.legalConclusionPermitted, false);
  assert.match(adjustment.reviewTask, /not classify this as a parliamentary amendment/i);
});

test('1397 and 1400 primary-source leads remain unverified after official portal timeouts', () => {
  const byYear = Object.fromEntries(matrix.amendments.map(item => [item.label, item]));
  const expected = {
    '1397': 'https://rc.majlis.ir/fa/law/show/1091223',
    '1400': 'https://qavanin.ir/Law/TreeText/?IDS=8508483613671622689'
  };
  for (const [year, url] of Object.entries(expected)) {
    const item = byYear[year];
    const observation = item.candidatePrimaryDocumentObservation;
    assert.equal(observation.url, url);
    assert.equal(observation.directFetchAttempt.result, 'timeout');
    assert.equal(observation.directFetchAttempt.retrieved, false);
    assert.equal(observation.legalTextImported, false);
    assert.equal(observation.independentPrimaryAmendmentTextVerified, false);
    assert.equal(item.independentPrimaryAmendmentTextVerified, false);
    assert.equal(item.officialGazettePublicationDate, null);
    assert.equal(item.effectiveDate, null);
  }
  assert.equal(matrix.releaseSourceEligible, false);
  assert.equal(matrix.legalConclusionPermitted, false);
});

test('1372 Qavanin text and current metadata are recorded without legal promotion', () => {
  const amendment = matrix.amendments.find(item => item.label === '1372');
  const candidate = amendment.candidateInstrument;
  assert.equal(candidate.candidatePrimaryTextRetrieved, true);
  assert.equal(candidate.primaryTextObservation.sourceType, 'official-qavanin-portal-amendment-text');
  assert.equal(candidate.primaryTextObservation.observedAt, '2026-11-24');
  assert.equal(candidate.primaryTextObservation.rawHttpResponseBytesCaptured, false);
  assert.equal(candidate.primaryTextObservation.rawResponseSha256, null);
  assert.equal(candidate.primaryMetadataObservation.observedAt, '2026-11-24');
  assert.equal(candidate.primaryMetadataObservation.metadataPageRendered, true);
  assert.ok(candidate.primaryMetadataObservation.visibleLines.includes(34));
  assert.equal(candidate.primaryMetadataObservation.officialGazetteNumberShown, '14189');
  assert.equal(candidate.primaryMetadataObservation.effectiveDateShown, '1372/09/17');
  assert.equal(candidate.publicationResearchLead.checkedAt, '2026-11-24');
  assert.equal(candidate.publicationResearchLead.primaryGazetteIssueRetrieved, false);
  assert.equal(candidate.publicationResearchLead.effectiveDateIndependentlyVerified, false);
  assert.equal(amendment.officialGazetteNumber, null);
  assert.equal(amendment.officialGazettePublicationDate, null);
  assert.equal(amendment.effectiveDate, null);
  assert.equal(amendment.transitionalApplicabilityVerified, false);
  assert.equal(amendment.humanReviewer, null);
  assert.equal(matrix.releaseSourceEligible, false);
  assert.equal(matrix.legalConclusionPermitted, false);

  const report = audit(matrix);
  assert.equal(report.status, 'RESEARCH_ONLY');
  assert.deepEqual(report.errors, []);
  const gaps = report.instruments.find(item => item.label === '1372').missingEvidence;
  assert.ok(!gaps.includes('independent_primary_instrument'));
  for (const gap of ['primary_official_gazette', 'verified_effective_date',
    'transitional_applicability', 'subsequent_amendments', 'human_legal_signoff']) {
    assert.ok(gaps.includes(gap), gap);
  }
});
