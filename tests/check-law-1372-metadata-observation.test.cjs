'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const register = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'));
const observation = JSON.parse(fs.readFileSync(path.join(root, 'docs/check-law-qavanin-recheck-20261125.json'), 'utf8'));
const record = register.records.find(item => item.id === 'check-issuance-law');
const candidate = record.officialDocumentUrlCandidates.find(item => item.documentId === '16863897128756457315');
const source = observation.sources.amendment1372;

test('1372 cheque amendment has direct official Qavanin text and metadata links', () => {
  assert.equal(candidate.url, 'https://qavanin.ir/Law/TreeText/?IDS=16863897128756457315');
  assert.equal(candidate.officialAttributeUrl, 'https://qavanin.ir/Law/Attribute/?IDS=16863897128756457315');
  assert.equal(source.directTextUrl, candidate.url);
  assert.equal(source.directMetadataUrl, candidate.officialAttributeUrl);
  assert.equal(source.approvalDateShown, '1372/08/11');
  assert.equal(source.guardianCouncilConfirmationDateShown, '1372/08/19');
  assert.equal(source.textPageRendered, true);
  assert.equal(source.metadataPageRendered, true);
  assert.equal(source.metadata.officialGazetteNumberShown, '14189');
  assert.equal(source.metadata.officialGazettePublicationDateShown, '1372/09/01');
  assert.equal(source.metadata.promulgationDateShown, '1372/08/25');
  assert.equal(source.metadata.effectiveDateShown, '1372/09/17');
  assert.equal(source.metadata.notificationNumberShown, '52663');
});

test('fresh rendered 1372 metadata still does not authenticate raw bytes or Gazette issue', () => {
  assert.equal(source.rawHttpResponseBytesCaptured, false);
  assert.equal(source.rawResponseSha256, null);
  assert.equal(source.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);
});

test('latest register observation is current but remains ineligible for legal answers', () => {
  assert.equal(candidate.lastDirectFetchAt, '2026-11-25');
  assert.equal(candidate.latestTextObservation.observedAt, '2026-11-25');
  assert.equal(candidate.latestMetadataObservation.observedAt, '2026-11-25');
  assert.equal(candidate.latestMetadataObservation.metadataPageRendered, true);
  assert.equal(candidate.latestMetadataObservation.effectiveDateShown, '1372/09/17');
  assert.equal(candidate.rawHttpBytesCaptured, false);
  assert.equal(candidate.rawResponseSha256, null);
  assert.equal(candidate.officialGazetteIssueBytesRetrieved, false);
  assert.equal(candidate.humanReviewStatus, 'pending');
  assert.equal(candidate.eventDateVersioningApproved, false);
  assert.equal(candidate.useInLegalAnswers, false);
  assert.equal(record.latest1372Observation.file, 'docs/check-law-qavanin-recheck-20261125.json');
  assert.equal(record.latest1372Observation.observedAt, '2026-11-25');
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
  assert.equal(register.policy.defaultUseInLegalAnswers, false);
});
