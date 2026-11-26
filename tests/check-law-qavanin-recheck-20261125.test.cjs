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
const amendment1372 = observation.sources.amendment1372;
const regulation1403 = observation.sources.regulation1403;
const candidate1372 = cheque.officialDocumentUrlCandidates.find(item => item.documentId === '16863897128756457315');
const candidate1403 = cheque.officialDocumentUrlCandidates.find(item => item.documentId === '634882870797924421');

test('records the 2026-11-25 direct Qavanin 1372 amendment text and metadata observation', () => {
  assert.equal(observation.schema, 'dadyar-qavanin-supplemental-recheck-v1');
  assert.equal(observation.observedAt, '2026-11-25');
  assert.equal(observation.status, 'official-rendered-observation-only');
  assert.equal(amendment1372.documentId, '16863897128756457315');
  assert.equal(amendment1372.directTextUrl, 'https://qavanin.ir/Law/TreeText/?IDS=16863897128756457315');
  assert.equal(amendment1372.directMetadataUrl, 'https://qavanin.ir/Law/Attribute/?IDS=16863897128756457315');
  assert.equal(amendment1372.textPageRendered, true);
  assert.ok(amendment1372.textVisibleLines.includes(68));
  assert.equal(amendment1372.approvalDateShown, '1372/08/11');
  assert.equal(amendment1372.guardianCouncilConfirmationDateShown, '1372/08/19');
  assert.equal(amendment1372.metadataPageRendered, true);
  assert.equal(amendment1372.metadata.officialGazetteNumberShown, '14189');
  assert.equal(amendment1372.metadata.officialGazettePublicationDateShown, '1372/09/01');
  assert.equal(amendment1372.metadata.promulgationDateShown, '1372/08/25');
  assert.equal(amendment1372.metadata.effectiveDateShown, '1372/09/17');
});

test('records the 1403 regulation metadata while preserving the text timeout and scope limitation', () => {
  assert.equal(regulation1403.documentId, '634882870797924421');
  assert.equal(regulation1403.textPageAttempted, true);
  assert.equal(regulation1403.textPageRendered, false);
  assert.equal(regulation1403.textFailure, 'timeout');
  assert.equal(regulation1403.metadataPageRendered, true);
  assert.equal(regulation1403.metadata.officialGazetteNumberShown, '23097');
  assert.equal(regulation1403.metadata.officialGazettePublicationDateShown, '1403/04/23');
  assert.equal(regulation1403.metadata.promulgationDateShown, '1403/04/04');
  assert.equal(regulation1403.metadata.effectiveDateShown, '1403/05/08');
  assert.equal(regulation1403.legalAnswerUsePermitted, false);
});

test('new official-page observations remain non-authorizing until raw bytes, Gazette issues, event-date versioning and human review are verified', () => {
  assert.equal(observation.verification.rawHttpResponseBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);
  assert.equal(candidate1372.lastDirectFetchAt, '2026-11-25');
  assert.equal(candidate1372.latestTextObservation.observedAt, '2026-11-25');
  assert.equal(candidate1372.latestMetadataObservation.observedAt, '2026-11-25');
  assert.equal(candidate1372.useInLegalAnswers, false);
  assert.equal(candidate1403.latestMetadataObservation.observedAt, '2026-11-25');
  assert.equal(candidate1403.useInLegalAnswers, false);
  assert.equal(cheque.latest1372Observation.file, 'docs/check-law-qavanin-recheck-20261125.json');
  assert.equal(cheque.latest1372Observation.observedAt, '2026-11-25');
  assert.equal(cheque.primarySourceVerified, false);
  assert.equal(cheque.humanReviewStatus, 'pending');
  assert.equal(cheque.useInLegalAnswers, false);
  assert.equal(register.latestSupplementalObservationFile, 'docs/check-law-qavanin-browser-recheck-20261126.json');
  assert.equal(register.lastSupplementalObservationAt, '2026-11-26');
  assert.ok(cheque.supplementalObservationAttempts.some(item =>
    item.file === 'docs/check-law-qavanin-recheck-20261125.json' &&
    item.observedAt === '2026-11-25' &&
    item.useInLegalAnswers === false
  ));
});
