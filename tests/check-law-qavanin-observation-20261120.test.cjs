'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const observation = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/check-law-qavanin-observation-20261120.json'), 'utf8'
));

test('2026-11-20 Qavanin recheck records official portal observations without promoting cheque law', () => {
  assert.equal(observation.schema, 'dadyar-qavanin-check-law-observation-v1');
  assert.equal(observation.topic, 'check');
  assert.equal(observation.observedAt, '2026-11-20');
  assert.equal(observation.status, 'research-only');
  assert.equal(observation.primarySourceVerified, false);
  assert.equal(observation.legalAnswerUsePermitted, false);
  assert.equal(observation.humanReviewStatus, 'pending');
  assert.equal(observation.rawHttpBytesCaptured, false);
  assert.equal(observation.rawResponseSha256, null);
});

test('the consolidated Article 7 rendering is not mistaken for an event-date version', () => {
  const law = observation.observations.consolidatedLaw;
  assert.equal(law.latestStatusLabelShown, 'اصلاحي 1403/03/30');
  assert.equal(law.currentArticle7TextRendered, true);
  assert.deepEqual(law.currentArticle7Lines, [83, 86]);
  assert.equal(law.rawHttpBytesCaptured, false);
  assert.equal(observation.eventDateVersioningApproved, false);
  assert.deepEqual(observation.eventDateVersions, []);
});

test('the 1403 approval date is not treated as Gazette publication or commencement', () => {
  const status = observation.observations.officialStatusIndex;
  const act = status.influencingInstrument;
  assert.equal(act.approvalDateShown, '1403/03/30');
  assert.equal(act["directTextFetchOn2026-11-20"], 'timeout');
  assert.equal(act["directMetadataFetchOn2026-11-20"], 'readable');
  assert.equal(act.gazetteNumber, '23097');
  assert.equal(act.gazettePublicationDate, '1403/04/23');
  assert.equal(act.effectiveDate, '1403/05/08');
  assert.equal(act.instrumentType, 'executive-regulation');
  assert.equal(act.metadataObservation.officialGazetteIssueBytesRetrieved, false);
  assert.equal(act.metadataObservation.rawHttpBytesCaptured, false);
  assert.equal(act.effectiveDateIndependentlyVerified, false);
  assert.equal(act.dateConflict.secondaryReportedEffectiveDate, '1403/05/07');
  assert.equal(act.dateConflict.officialQavaninEffectiveDateShown, '1403/05/08');
  assert.match(status.dateMeaning, /not, by itself, a Gazette publication date or commencement date/);
});

test('the readable 1400 amendment remains non-authorizing until bytes and human review are bound', () => {
  const amendment = observation.observations.amendment1400;
  assert.equal(amendment.textRendered, true);
  assert.equal(amendment.metadataObservation.officialGazetteNumberShown, '22188');
  assert.equal(amendment.metadataObservation.effectiveDateShown, '1400/03/18');
  assert.equal(amendment.metadataObservation.rawHttpBytesCaptured, false);
  assert.equal(amendment.humanReviewStatus, 'pending');
  assert.equal(amendment.legalAnswerUsePermitted, false);
});
