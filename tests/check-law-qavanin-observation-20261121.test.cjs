'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-qavanin-observation-20261121.json'), 'utf8'
));
const registry = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'
));

test('2026-11-21 official Qavanin recheck records rendered amendment text and metadata without promotion', () => {
  assert.equal(observation.schema, 'dadyar-qavanin-check-law-observation-v1');
  assert.equal(observation.topic, 'check');
  assert.equal(observation.observedAt, '2026-11-21');
  assert.equal(observation.status, 'research-only');
  assert.equal(observation.primarySourceVerified, false);
  assert.equal(observation.humanReviewStatus, 'pending');
  assert.equal(observation.legalAnswerUsePermitted, false);
  assert.equal(observation.eventDateVersioningApproved, false);
  assert.deepEqual(observation.eventDateVersions, []);
});

test('official Qavanin text and metadata observations retain exact rendered dates and direct URLs', () => {
  const act = observation.observations.amendment1400;
  assert.equal(act.directTextUrl, 'https://qavanin.ir/Law/TreeText/?IDS=8508483613671622689');
  assert.equal(act.directMetadataUrl, 'https://qavanin.ir/Law/Attribute/?IDS=8508483613671622689');
  assert.equal(act.textPageRendered, true);
  assert.deepEqual(act.textPageLines, [7, 55]);
  assert.equal(act.metadataPageRendered, true);
  assert.deepEqual(act.metadataPageLines, [19, 34]);
  assert.equal(act.approvalDateShown, '1400/01/29');
  assert.equal(act.guardianCouncilConfirmationDateShown, '1400/02/18');
  assert.equal(act.officialGazetteNumberShown, '22188');
  assert.equal(act.officialGazettePublicationDateShown, '1400/03/02');
  assert.equal(act.promulgationDateShown, '1400/02/28');
  assert.equal(act.effectiveDateShown, '1400/03/18');
  assert.equal(act.currentConsolidatedStatusLabelShown, 'اصلاحي 1403/03/30');
  assert.match(act.observedProvisions.article2, /after the end of Esfand 1399/);
  assert.equal(act.rawHttpBytesCaptured, false);
  assert.equal(act.rawResponseSha256, null);
  assert.equal(act.humanReviewStatus, 'pending');
  assert.equal(act.legalAnswerUsePermitted, false);
});

test('registry links the new observation but does not mark the cheque law as verified', () => {
  const record = registry.records.find(item => item.id === 'check-issuance-law');
  assert.ok(record);
  // The 2026-11-21 observation remains historical evidence; the registry now points
  // to the newer 2026-11-22 recheck without promoting either observation.
  assert.equal(record.latestIndependentObservation.file, 'docs/check-law-qavanin-observation-20261122.json');
  assert.equal(record.latestIndependentObservation.observedAt, '2026-11-22');
  assert.equal(record.latestIndependentObservation.statusIndexRendered, true);
  assert.equal(record.latestIndependentObservation.amendment1358TextRendered, true);
  assert.equal(record.latestIndependentObservation.rawHttpBytesCaptured, false);
  assert.equal(record.latestIndependentObservation.rawResponseSha256, null);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
});


test('2026-11-21 official status index and the 1358 act are recorded without legal-answer promotion', () => {
  const index = observation.statusIndexRecheck;
  assert.equal(index.directUrl, 'https://qavanin.ir/Law/StatusIndex/?IDS=11400475274213876131');
  assert.equal(index.observedAt, '2026-11-21');
  assert.deepEqual(index.renderedLines, [17, 30]);
  assert.equal(index.influencingActs.length, 10);
  assert.match(index.dateFieldMeaning, /not publication or effective dates/);

  const act = observation.observations.amendment1358;
  assert.equal(act.directTextUrl, 'https://qavanin.ir/Law/TreeText/?IDS=5510706429727435487');
  assert.equal(act.directMetadataUrl, 'https://qavanin.ir/Law/Attribute/?IDS=5510706429727435487');
  assert.deepEqual(act.textPageLines, [42, 45]);
  assert.deepEqual(act.metadataPageLines, [19, 34]);
  assert.equal(act.approvalDateShown, '1358/04/31');
  assert.equal(act.officialGazetteNumberShown, '10043');
  assert.equal(act.officialGazettePublicationDateShown, '1358/05/25');
  assert.equal(act.effectiveDateShown, '1358/04/31');
  assert.equal(act.rawHttpBytesCaptured, false);
  assert.equal(act.rawResponseSha256, null);
  assert.equal(act.primarySourceVerified, false);
  assert.equal(act.humanReviewStatus, 'pending');
  assert.equal(act.legalAnswerUsePermitted, false);
  assert.equal(act.eventDateVersioningApproved, false);

  const record = registry.records.find(item => item.id === 'check-issuance-law');
  const candidate = record.officialDocumentUrlCandidates.find(item =>
    item.documentId === '5510706429727435487');
  assert.ok(candidate);
  assert.equal(candidate.textPageRendered, true);
  assert.equal(candidate.metadataPageRendered, true);
  assert.equal(candidate.officialGazetteNumberShown, '10043');
  assert.equal(candidate.primarySourceVerified, false);
  assert.equal(candidate.useInLegalAnswers, false);
  assert.equal(record.officialPortalObservation.officialStatusIndex.latestRecheck.observedAt, '2026-11-22');
  assert.equal(record.officialPortalObservation.officialStatusIndex.latestRecheck.amendment1358TextRendered, true);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
});
