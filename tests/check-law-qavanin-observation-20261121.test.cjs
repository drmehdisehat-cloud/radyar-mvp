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
  assert.equal(record.latestIndependentObservation.file, 'docs/check-law-qavanin-observation-20261121.json');
  assert.equal(record.latestIndependentObservation.observedAt, '2026-11-21');
  assert.equal(record.latestIndependentObservation.directTextPageRendered, true);
  assert.equal(record.latestIndependentObservation.directMetadataPageRendered, true);
  assert.equal(record.latestIndependentObservation.rawHttpBytesCaptured, false);
  assert.equal(record.latestIndependentObservation.rawResponseSha256, null);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
});
