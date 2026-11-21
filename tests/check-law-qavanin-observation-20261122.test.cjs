'use strict';
// Fresh official-portal observations are evidence leads only, not legal approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const observation = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/check-law-qavanin-observation-20261122.json'), 'utf8'));

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
  assert.equal(observation.influencingInstruments.length, 10);
  for (const instrument of observation.influencingInstruments) {
    assert.match(instrument.approvalDateShown, /^\\d{4}\\/\\d{2}\\/\\d{2}$/);
  }
});

test('portal approval dates and rendered text are never promoted to effective-date legal sources', () => {
  assert.match(observation.sources.officialStatusIndex.fieldMeaning, /not, by themselves, Gazette publication dates or effective dates/);
  assert.equal(observation.verification.rawHttpBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);
  assert.equal(observation.openGaps.length, 5);
  assert.ok(observation.nextActions.some(item => /SHA-256/.test(item)));
});
