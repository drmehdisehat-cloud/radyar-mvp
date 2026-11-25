'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-qavanin-recheck-20261125.json'), 'utf8'
));
const register = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'
));
const cheque = register.records.find(item => item.id === 'check-issuance-law');
const source = observation.sources.consolidatedChequeLaw;
const candidate = cheque.officialDocumentUrlCandidates.find(item =>
  item.documentId === '11400475274213876131'
);

test('records the 2026-11-25 Qavanin consolidated cheque-law text and metadata observation', () => {
  assert.equal(observation.observedAt, '2026-11-25');
  assert.equal(source.sourceClass, 'primary-official-qavanin');
  assert.equal(source.directTextUrl, 'https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131');
  assert.equal(source.directMetadataUrl, 'https://qavanin.ir/Law/Attribute/?IDS=11400475274213876131');
  assert.equal(source.textPageRendered, true);
  assert.equal(source.metadataPageRendered, true);
  assert.equal(source.originalAdoptionDateShown, '1355/04/16');
  assert.deepEqual(source.amendmentLabelsShown, [
    'الحاقی 11/08/1372',
    'اصلاحی 29/01/1400',
    'اصلاحی 30/03/1403'
  ]);
  assert.equal(source.metadata.officialGazetteNumberShown, '9210');
  assert.equal(source.metadata.officialGazettePublicationDateShown, '1355/05/19');
  assert.equal(source.metadata.originalPromulgationDateShown, '1355/05/09');
  assert.equal(source.metadata.originalEffectiveDateShown, '1355/06/04');
  assert.equal(source.metadata.latestStatusShown, 'اصلاحی 1403/03/30');
  assert.ok(source.textVisibleLines.includes(83));
  assert.ok(source.metadataVisibleLines.includes(34));
});

test('keeps the consolidated law non-authorizing until raw bytes, Gazette issues, event-date versioning and human review are verified', () => {
  assert.equal(source.rawHttpResponseBytesCaptured, false);
  assert.equal(source.rawResponseSha256, null);
  assert.equal(source.officialGazetteIssueBytesRetrieved, false);
  assert.equal(source.primarySourceVerified, false);
  assert.equal(source.currentConsolidatedTextVerified, false);
  assert.equal(source.amendmentEffectiveDatesVerified, false);
  assert.equal(source.humanReviewStatus, 'pending');
  assert.equal(source.eventDateVersioningApproved, false);
  assert.equal(source.legalAnswerUsePermitted, false);
  assert.equal(candidate.lastDirectFetchAt, '2026-11-26');
  assert.equal(candidate.latestTextObservation.observedAt, '2026-11-25');
  assert.equal(candidate.latestMetadataObservation.observedAt, '2026-11-26');
  assert.equal(candidate.latestRecheck.directTextPageRendered, false);
  assert.equal(candidate.latestRecheck.directTextResult, 'transfer-interstitial-only');
  assert.equal(candidate.primarySourceVerified, false);
  assert.equal(candidate.humanReviewStatus, 'pending');
  assert.equal(candidate.useInLegalAnswers, false);
  assert.equal(cheque.latestConsolidatedObservation.documentId, '11400475274213876131');
  assert.equal(cheque.latestConsolidatedObservation.useInLegalAnswers, false);
  assert.ok(cheque.supplementalObservationAttempts.some(item =>
    item.documentId === '11400475274213876131' &&
    item.observedAt === '2026-11-25' &&
    item.useInLegalAnswers === false
  ));
});
