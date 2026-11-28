'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(path.join(root, 'docs/check-law-qavanin-direct-observation-20261128.json'), 'utf8'));
const register = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'));
const canonical = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-registry-check.json'), 'utf8'));

const law = observation.records.find(item => item.id === 'check-issuance-law');
const regulation = observation.records.find(item => item.id === 'cheque-amount-regulation-1403');
const registerRecord = register.records.find(item => item.id === 'check-issuance-law');
const lawCandidate = registerRecord.officialDocumentUrlCandidates.find(item => item.documentId === law.documentId);
const regulationCandidate = registerRecord.officialDocumentUrlCandidates.find(item => item.documentId === regulation.documentId);

test('records the 2026-11-28 direct official Qavanin page observations and exact document links', () => {
  assert.equal(observation.observedAt, '2026-11-28');
  assert.equal(law.directUrls.text, 'https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131');
  assert.equal(law.textPage.rendered, true);
  assert.deepEqual(law.textPage.visibleLineRange, [7, 90]);
  assert.equal(law.textPage.article7Amendment.marker, 'اصلاحي 30ˏ03ˏ1403');
  assert.equal(law.metadataPage.rendered, false);
  assert.equal(law.imagePage.rendered, false);
  assert.equal(regulation.directUrls.metadata, 'https://qavanin.ir/Law/Attribute/?IDS=634882870797924421');
  assert.equal(regulation.metadataPage.rendered, true);
  assert.equal(regulation.metadataPage.officialGazetteNumberShown, '23097');
  assert.equal(regulation.metadataPage.officialGazettePublicationDateShown, '1403/04/23');
  assert.equal(regulation.metadataPage.effectiveDateShown, '1403/05/08');
  assert.equal(regulation.textPage.rendered, false);
  assert.equal(regulation.imagePage.shellOnly, true);
  assert.equal(regulation.imagePage.pageImagesRetrieved, false);
  assert.equal(regulation.imagePage.officialGazettePdfBytesRetrieved, false);
});

test('both direct-page observations remain research-only until bytes, hashes, Gazette files, event-date versioning and human review exist', () => {
  for (const record of [law, regulation]) {
    assert.equal(record.evidence.rawHttpResponseBytesCaptured, false);
    assert.equal(record.evidence.rawResponseSha256, null);
    assert.equal(record.evidence.officialGazetteIssueBytesRetrieved, false);
    assert.equal(record.evidence.primarySourceVerified, false);
    assert.equal(record.evidence.eventDateVersioningApproved, false);
    assert.equal(record.humanReviewStatus, 'pending');
    assert.equal(record.useInLegalAnswers, false);
    assert.equal(record.decision, 'research-only');
  }
  assert.equal(observation.releaseDecision.legalAnswerUsePermitted, false);
  assert.equal(register.latestDirectObservationFile, 'docs/check-law-qavanin-direct-observation-20261128.json');
  assert.equal(registerRecord.primarySourceVerified, false);
  assert.equal(registerRecord.humanReviewStatus, 'pending');
  assert.equal(registerRecord.useInLegalAnswers, false);
  assert.equal(lawCandidate.latestDirectObservationFile, 'docs/check-law-qavanin-direct-observation-20261128.json');
  assert.equal(regulationCandidate.latestDirectObservationFile, 'docs/check-law-qavanin-direct-observation-20261128.json');
  assert.equal(lawCandidate.primarySourceVerified, false);
  assert.equal(regulationCandidate.primarySourceVerified, false);
  assert.equal(canonical.latestDirectObservationFile, 'docs/check-law-qavanin-direct-observation-20261128.json');
  assert.equal(canonical.status, 'research-only');
  assert.equal(canonical.releaseSourceEligible, false);
  assert.equal(canonical.legalConclusionPermitted, false);
});
