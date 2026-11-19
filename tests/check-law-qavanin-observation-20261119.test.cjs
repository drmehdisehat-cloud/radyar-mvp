'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const observation = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/check-law-qavanin-observation-20261119.json'), 'utf8'
));
const register = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/legal-source-register-v1.json'), 'utf8'
));

test('official Qavanin pages are recorded as primary research observations without premature answer promotion', () => {
  assert.equal(observation.status, 'research-only');
  assert.equal(observation.legalAnswerUsePermitted, false);
  assert.equal(observation.primarySourceVerified, false);
  assert.equal(observation.humanReviewStatus, 'pending');
  assert.equal(observation.originalLawMetadata.officialGazetteNumberShown, '9210');
  assert.equal(observation.originalLawMetadata.officialGazetteDateShown, '1355/05/19');
  assert.equal(observation.originalLawMetadata.originalEffectiveDateShown, '1355/06/04');
  assert.equal(observation.originalLawMetadata.latestStatusLabelShown, 'اصلاحي 1403/03/30');
  assert.equal(observation.officialStatusIndex.influencingActs.length, 10);
  assert.equal(observation.officialStatusIndex.dateFieldMeaning,
    'approval dates displayed by the official status index; not publication or effective dates');
});

test('1397 and 1400 primary texts are readable but remain unverified until byte hashing and event-date review', () => {
  for (const id of ['check-amendment-1397', 'check-amendment-1400']) {
    const source = observation.amendmentPages.find(item => item.id === id);
    assert.ok(source);
    assert.equal(source.textRendered, 'yes');
    assert.equal(source.rawHttpBytesCaptured, false);
    assert.equal(source.rawResponseSha256, null);
    assert.equal(source.publicationDate, null);
    assert.equal(source.effectiveFrom, null);
    assert.equal(source.humanReviewStatus, 'pending');
  }
});

test('1403 amendment direct-text timeout and missing amendment dates remain explicit', () => {
  const source = observation.amendmentPages.find(item => item.id === 'check-amendment-1403');
  assert.ok(source);
  assert.equal(source.textRendered, 'no');
  assert.equal(source.retrievalResult, 'timeout on 2026-11-19');
  assert.equal(source.publicationDate, null);
  assert.equal(source.effectiveFrom, null);
  assert.equal(observation.nextActions.length, 5);
});

test('live research observation cannot promote the check law into the legal-answer register', () => {
  const record = register.records.find(item => item.id === 'check-issuance-law');
  assert.ok(record);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
  assert.equal(record.officialPortalObservation.rawResponseSha256, null);
  assert.equal(record.officialPortalObservation.legalAnswerUsePermitted, false);
});
