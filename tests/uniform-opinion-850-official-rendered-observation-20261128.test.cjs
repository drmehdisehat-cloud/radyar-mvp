'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { auditLegalSourceRegister, directOfficialDocumentUrl } = require('../backend/legal-source-register-policy.cjs');

const root = path.join(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(path.join(root, 'docs/uniform-opinion-850-source-observation-20261128.json'), 'utf8'));
const register = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'));

test('opinion 850 fresh official Qavanin rendering records the holding without treating it as authenticated legal source', () => {
  assert.equal(observation.schema, 'dadyar-uniform-opinion-source-observation-v1');
  assert.equal(observation.observedAt, '2026-11-28');
  assert.equal(observation.decisionDateJalali, '1403/05/16');
  assert.equal(observation.textPage.rendered, true);
  assert.deepEqual(observation.textPage.visibleLineRange, [7, 64]);
  assert.equal(observation.textPage.operativeHoldingVisibleAtLine, 63);
  assert.equal(observation.textPage.bindingClauseVisibleAtLine, 64);
  assert.equal(observation.metadataPage.rendered, true);
  assert.equal(observation.metadataPage.officialGazetteNumberShown, null);
  assert.equal(observation.metadataPage.officialGazettePublicationDateShown, null);
  assert.equal(observation.publicationTransmissionObservation.numberShown, '9000/6345/110');
  assert.match(observation.publicationTransmissionObservation.description, /شماره یا تاریخ انتشار شماره روزنامه رسمی نیست/);
  assert.equal(observation.verification.rawHttpBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.useInLegalAnswers, false);
  assert.equal(observation.verification.legalConclusionPermitted, false);
  assert.equal(directOfficialDocumentUrl(observation.primaryOfficialDocumentUrl, '6755160463259811436'), true);
  assert.equal(directOfficialDocumentUrl(observation.officialMetadataUrl, '6755160463259811436'), false);
});

test('registry points to the latest opinion 850 observation but keeps the record research-only', () => {
  const record = register.records.find(item => item.id === 'uniform-opinion-850');
  assert.ok(record);
  assert.equal(record.primaryOfficialDocumentUrl, null);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
  assert.equal(record.latestOfficialRenderedObservation.file, 'docs/uniform-opinion-850-source-observation-20261128.json');
  const candidate = record.officialDocumentUrlCandidates.find(item => item.documentId === '6755160463259811436');
  assert.ok(candidate);
  assert.equal(candidate.rawHttpBytesCaptured, false);
  assert.equal(candidate.rawResponseSha256, null);
  assert.equal(candidate.officialGazetteNumberShown, null);
  assert.equal(candidate.humanReviewStatus, 'pending');
  assert.equal(candidate.eventDateVersioningApproved, false);
  assert.equal(candidate.useInLegalAnswers, false);
  const audit = auditLegalSourceRegister(register);
  assert.equal(audit.valid, true, audit.issues.join('\\n'));
  assert.equal(audit.structuralOnly, true);
  assert.deepEqual(audit.answerEligibleRecordIds, []);
});
