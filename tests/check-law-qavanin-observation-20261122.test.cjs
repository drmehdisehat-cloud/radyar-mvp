'use strict';
// Fresh official-portal observations are evidence leads only, not legal approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const observation = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/check-law-qavanin-observation-20261122.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/legal-source-register-v1.json'), 'utf8'));

test('2026-11-22 Qavanin observation preserves direct official links and visible source lines', () => {
  assert.equal(observation.schemaVersion, 1);
  assert.equal(observation.topic, 'check');
  assert.equal(observation.status, 'official-portal-observation-only');
  assert.equal(observation.observedAt, '2026-11-22');
  assert.equal(observation.sources.officialStatusIndex.url,
    'https://qavanin.ir/Law/StatusIndex/?IDS=11400475274213876131');
  assert.deepEqual(observation.sources.officialStatusIndex.visibleLines, [17, 20, 30]);
  assert.equal(observation.sources.amendment1358.textUrl,
    'https://qavanin.ir/Law/TreeText/?IDS=5510706429727435487');
  assert.deepEqual(observation.sources.amendment1358.visibleLines, [7, 10, 42, 45]);
  assert.equal(observation.sources.amendment1397.url,
    'https://qavanin.ir/Law/TreeText/?IDS=3613585600919945767');
  assert.equal(observation.sources.amendment1397.approvalDateShown, '1397/08/13');
  assert.equal(observation.sources.amendment1397.guardianCouncilConfirmationDateShown, '1397/08/23');
  assert.deepEqual(observation.sources.amendment1397.visibleLines, [7, 9, 42, 43, 45, 46, 47, 48, 49, 50, 51, 82, 83, 84, 85, 86, 87, 88, 90, 91]);
  assert.equal(observation.sources.amendment1397.metadataUrl,
    'https://qavanin.ir/Law/Attribute/?IDS=3613585600919945767');
  assert.equal(observation.sources.amendment1397.metadataRendered, true);
  assert.deepEqual(observation.sources.amendment1397.metadataVisibleLines, [19, 21, 22, 24, 26, 30, 32, 33, 34]);
  assert.equal(observation.sources.amendment1397.metadataObservation.officialGazetteNumberShown, '21467');
  assert.equal(observation.sources.amendment1397.metadataObservation.effectiveDateShown, '1397/09/21');
  assert.equal(observation.sources.amendment1400.url,
    'https://qavanin.ir/Law/TreeText/?IDS=8508483613671622689');
  assert.equal(observation.sources.amendment1400.approvalDateShown, '1400/01/29');
  assert.equal(observation.sources.amendment1400.guardianCouncilConfirmationDateShown, '1400/02/18');
  assert.deepEqual(observation.sources.amendment1400.visibleLines, [7, 9, 42, 43, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55]);
  assert.equal(observation.sources.amendment1400.metadataUrl,
    'https://qavanin.ir/Law/Attribute/?IDS=8508483613671622689');
  assert.equal(observation.sources.amendment1400.metadataRendered, true);
  assert.deepEqual(observation.sources.amendment1400.metadataVisibleLines, [19, 21, 22, 24, 26, 30, 32, 33, 34]);
  assert.equal(observation.sources.amendment1400.metadataObservation.officialGazetteNumberShown, '22188');
  assert.equal(observation.sources.amendment1400.metadataObservation.effectiveDateShown, '1400/03/18');
  assert.equal(observation.influencingInstruments.length, 10);
  for (const instrument of observation.influencingInstruments) {
    assert.match(instrument.approvalDateShown, /^\d{4}\/\d{2}\/\d{2}$/);
  }
});

test('portal approval dates and rendered text are never promoted to effective-date legal sources', () => {
  assert.match(observation.sources.officialStatusIndex.fieldMeaning, /not, by themselves, Gazette publication dates or effective dates/);
  assert.equal(observation.verification.rawHttpBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.amendment1397MetadataRendered, true);
  assert.equal(observation.verification.amendment1400MetadataRendered, true);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);
  assert.equal(observation.sources.amendment1397.rendered, true);
  assert.equal(observation.sources.amendment1400.rendered, true);
  assert.ok(observation.openGaps.length >= 6);
  assert.ok(observation.openGaps.some(item => /1397 and 1400/.test(item)));
  assert.ok(observation.nextActions.some(item => /SHA-256/.test(item)));
});

test('the central legal registry links the fresh observation without promoting it', () => {
  const record = registry.records.find(item => item.id === 'check-issuance-law');
  assert.ok(record);
  assert.equal(record.latestIndependentObservation.file,
    'docs/check-law-qavanin-observation-20261122.json');
  assert.equal(record.latestIndependentObservation.observedAt, '2026-11-22');
  assert.equal(record.latestIndependentObservation.rawHttpBytesCaptured, false);
  assert.equal(record.latestIndependentObservation.primarySourceVerified, false);
  assert.equal(record.latestIndependentObservation.humanReviewStatus, 'pending');
  assert.equal(record.latestIndependentObservation.useInLegalAnswers, false);
  assert.equal(record.latestIndependentObservation.amendment1397TextRendered, true);
  assert.equal(record.latestIndependentObservation.amendment1400TextRendered, true);
  assert.equal(record.latestIndependentObservation.amendment1397MetadataRendered, true);
  assert.equal(record.latestIndependentObservation.amendment1400MetadataRendered, true);
  for (const documentId of ['3613585600919945767', '8508483613671622689']) {
    const candidate = record.officialDocumentUrlCandidates.find(item => item.documentId === documentId);
    assert.ok(candidate, 'official amendment candidate missing: ' + documentId);
    assert.equal(candidate.lastDirectFetchAt, '2026-11-22');
    assert.equal(candidate.rawHttpBytesCaptured, false);
    assert.equal(candidate.latestTextObservation.observedAt, '2026-11-22');
    assert.equal(candidate.latestTextObservation.primarySourceVerified, false);
    assert.equal(candidate.latestTextObservation.humanReviewStatus, 'pending');
    assert.equal(candidate.latestTextObservation.useInLegalAnswers, false);
  }
  const amendment = record.officialDocumentUrlCandidates.find(item =>
    item.documentId === '5510706429727435487');
  assert.ok(amendment);
  assert.equal(amendment.latestTextObservation.observedAt, '2026-11-22');
  assert.equal(amendment.latestTextObservation.rawHttpBytesCaptured, false);
  assert.equal(amendment.latestTextObservation.useInLegalAnswers, false);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
});
