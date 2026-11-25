'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-qavanin-recheck-20261126.json'), 'utf8'
));
const register = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'
));
const cheque = register.records.find(item => item.id === 'check-issuance-law');
const candidate = cheque.officialDocumentUrlCandidates.find(
  item => item.documentId === '11400475274213876131'
);
const source = observation.sources.consolidatedChequeLaw;

test('records the 2026-11-26 official Qavanin metadata observation and direct links', () => {
  assert.equal(observation.schema, 'dadyar-qavanin-supplemental-recheck-v1');
  assert.equal(observation.observedAt, '2026-11-26');
  assert.equal(observation.status, 'official-metadata-rendered-only');
  assert.equal(source.directTextUrl, 'https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131');
  assert.equal(source.directMetadataUrl, 'https://qavanin.ir/Law/Attribute/?IDS=11400475274213876131');
  assert.equal(source.textPageAttempted, true);
  assert.equal(source.textPageRendered, false);
  assert.equal(source.textPageResult, 'transfer-interstitial-only');
  assert.equal(source.metadataPageRendered, true);
  assert.equal(source.metadata.officialGazetteNumberShown, '9210');
  assert.equal(source.metadata.officialGazettePublicationDateShown, '1355/05/19');
  assert.equal(source.metadata.originalEffectiveDateShown, '1355/06/04');
  assert.equal(source.metadata.latestStatusShown, 'اصلاحي 1403/03/30');
});

test('metadata-only observation remains non-authorizing and preserves the last readable text observation', () => {
  assert.equal(source.rawHttpResponseBytesCaptured, false);
  assert.equal(source.rawResponseSha256, null);
  assert.equal(source.officialGazetteIssueBytesRetrieved, false);
  assert.equal(source.primarySourceVerified, false);
  assert.equal(source.humanReviewStatus, 'pending');
  assert.equal(source.eventDateVersioningApproved, false);
  assert.equal(source.legalAnswerUsePermitted, false);
  assert.equal(candidate.lastDirectFetchAt, '2026-11-26');
  assert.equal(candidate.latestMetadataObservation.observedAt, '2026-11-26');
  assert.equal(candidate.latestMetadataObservation.originalGazetteNumberShown, '9210');
  assert.equal(candidate.latestMetadataObservation.originalGazettePublicationDateShown, '1355/05/19');
  assert.equal(candidate.latestMetadataObservation.rawHttpResponseBytesCaptured, false);
  assert.equal(candidate.latestMetadataObservation.useInLegalAnswers, false);
  assert.equal(candidate.latestTextObservation.observedAt, '2026-11-25');
  assert.equal(candidate.latestTextObservation.useInLegalAnswers, false);
  assert.equal(cheque.primarySourceVerified, false);
  assert.equal(cheque.humanReviewStatus, 'pending');
  assert.equal(cheque.useInLegalAnswers, false);
  assert.equal(register.latestSupplementalObservationFile, 'docs/check-law-qavanin-recheck-20261126.json');
  assert.equal(register.lastSupplementalObservationAt, '2026-11-26');
  assert.equal(register.observedAt, '2026-11-26');
  assert.ok(cheque.supplementalObservationAttempts.some(item =>
    item.file === 'docs/check-law-qavanin-recheck-20261126.json' &&
    item.observedAt === '2026-11-26' &&
    item.useInLegalAnswers === false
  ));
});
