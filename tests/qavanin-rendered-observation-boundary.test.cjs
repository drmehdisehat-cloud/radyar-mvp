'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { auditLegalSourceRegister } = require('../backend/legal-source-register-policy.cjs');

const root = path.join(__dirname, '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

test('rendered Qavanin cheque pages remain research observations until raw bytes, Gazette issues and review are verified', () => {
  const observation = readJson('docs/check-law-qavanin-recheck-20261124.json');
  assert.equal(observation.status, 'official-rendered-observation-only');
  assert.equal(observation.verification.rawHttpResponseBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);

  const amendment = observation.sources.amendment1372;
  assert.equal(amendment.metadataPageRendered, true);
  assert.equal(amendment.lastSuccessfulMetadata.officialGazetteNumberShown, '14189');
  assert.equal(amendment.lastSuccessfulMetadata.effectiveDateShown, '1372/09/17');
  assert.equal(amendment.metadataObservation.rawHttpResponseBytesCaptured, false);
  assert.equal(amendment.metadataObservation.officialGazetteIssueBytesRetrieved, false);
  assert.equal(amendment.metadataObservation.useInLegalAnswers, false);
});

test('rendered Uniform Opinion 850 text does not turn a transmission letter into Gazette metadata or legal approval', () => {
  const observation = readJson('docs/uniform-opinion-850-source-observation-20261124.json');
  assert.equal(observation.status, 'official-qavanin-rendered-observation-only');
  assert.equal(observation.textPage.rendered, true);
  assert.equal(observation.textPage.operativeHoldingVisibleAtLine, 63);
  assert.equal(observation.textPage.bindingClauseVisibleAtLine, 64);
  assert.equal(observation.publicationTransmissionObservation.numberShown, '9000/6345/110');
  assert.equal(observation.metadataPage.officialGazetteNumberShown, null);
  assert.equal(observation.verification.rawHttpBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.useInLegalAnswers, false);
  assert.equal(observation.verification.legalConclusionPermitted, false);
});

test('the live legal register still exposes no answer-eligible source', () => {
  const register = readJson('docs/legal-source-register-v1.json');
  const audit = auditLegalSourceRegister(register);
  assert.equal(audit.valid, true, audit.issues.join('\\n'));
  assert.equal(audit.structuralOnly, true);
  assert.deepEqual(audit.answerEligibleRecordIds, []);
  for (const record of register.records) {
    assert.equal(record.primarySourceVerified, false, record.id);
    assert.equal(record.humanReviewStatus, 'pending', record.id);
    assert.equal(record.useInLegalAnswers, false, record.id);
  }
});
