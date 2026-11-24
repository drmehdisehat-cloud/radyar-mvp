'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-consolidated-observation-20261123.json'), 'utf8'
));
const register = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'
));
const record = register.records.find(item => item.id === 'check-issuance-law');
const candidate = record.officialDocumentUrlCandidates.find(
  item => item.documentId === '11400475274213876131'
);

test('records direct official Qavanin consolidated-text and original-law metadata observation', () => {
  assert.equal(observation.schema, 'dadyar-qavanin-consolidated-law-observation-v1');
  assert.equal(observation.status, 'official-consolidated-text-and-original-metadata-rendered-only');
  assert.equal(observation.source.sourceClass, 'primary-official-qavanin');
  assert.equal(observation.source.directTextUrl,
    'https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131');
  assert.equal(observation.source.directMetadataUrl,
    'https://qavanin.ir/Law/Attribute/?IDS=11400475274213876131');
  assert.equal(observation.source.originalGazetteNumberShown, '9210');
  assert.equal(observation.source.originalGazettePublicationDateShown, '1355/05/19');
  assert.equal(observation.source.originalPromulgationDateShown, '1355/05/09');
  assert.equal(observation.source.originalEffectiveDateShown, '1355/06/04');
  assert.equal(observation.source.article1AmendmentLabelShown, 'الحاقی 11/08/1372');
  assert.equal(observation.source.latestStatusLabelShown, 'اصلاحي 1403/03/30');
});

test('original-law metadata is not misrepresented as the effective date of later amendments', () => {
  assert.match(observation.scope, /not an amendment-specific Gazette copy/i);
  assert.equal(observation.verification.originalGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.amendmentSpecificGazetteIssueRetrieved, false);
  assert.equal(observation.verification.amendmentEffectiveDatesVerified, false);
  assert.equal(observation.verification.eventDateVersioningApproved, false);
});

test('raw bytes and independent human review remain mandatory before legal-answer use', () => {
  assert.equal(observation.verification.rawHttpResponseBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.legalAnswerUsePermitted, false);
  assert.equal(candidate.lastDirectFetchAt, '2026-11-23');
  assert.equal(candidate.latestTextObservation.rawHttpResponseBytesCaptured, false);
  assert.equal(candidate.latestMetadataObservation.originalGazetteNumberShown, '9210');
  assert.equal(candidate.primarySourceVerified, false);
  assert.equal(candidate.humanReviewStatus, 'pending');
  assert.equal(candidate.useInLegalAnswers, false);
  assert.equal(record.latestConsolidatedTextObservation.file,
    'docs/check-law-consolidated-observation-20261123.json');
  assert.equal(record.latestConsolidatedTextObservation.useInLegalAnswers, false);
  assert.equal(register.policy.defaultUseInLegalAnswers, false);
});
