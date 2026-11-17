'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handoffPath = path.join(__dirname, '../docs/uniform-opinion-850-source-handoff-20261115.json');
const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));

test('uniform opinion 850 remains research-only until primary text and human review are verified', () => {
  assert.equal(handoff.authorityId, 'uniform-opinion-850-1403-05-16');
  assert.equal(handoff.issuedAtJalali, '1403/05/16');
  assert.match(handoff.officialSourceCandidate.url, /^https:\/\/qavanin\.ir\/Law\/TreeText\/\?IDS=[1-9][0-9]*$/);
  assert.equal(handoff.officialSourceCandidate.textRetrieved, false);
  assert.equal(handoff.officialSourceCandidate.status, 'candidate-not-retrieved');
  assert.equal(handoff.eventVersion.effectiveFromJalali, null);
  assert.equal(handoff.eventVersion.applicableToEventDate, 'not-determined');
  assert.equal(handoff.humanReview.status, 'not-reviewed');
  assert.equal(handoff.humanReview.reviewer, null);
  assert.equal(handoff.releaseSourceEligible, false);
  assert.equal(handoff.legalConclusionPermitted, false);
  assert.ok(handoff.evidenceGaps.length >= 4);
  assert.ok(handoff.secondaryLeads.every(item => item.status === 'secondary-reproduction-not-primary'));
});

test('fresh official-portal transfer shells and timeouts do not promote opinion 850', () => {
  const retry = handoff.latestOfficialSourceRetry;
  assert.equal(retry.observedAt, '2026-11-17');
  assert.equal(handoff.status, 'research-only');
  assert.equal(handoff.releaseSourceEligible, false);
  assert.equal(handoff.legalConclusionPermitted, false);

  assert.equal(retry.officialSourceAttempts.length, 3);
  assert.ok(retry.officialSourceAttempts.some(item => item.retrievalResult === 'transfer-shell-only'));
  assert.ok(retry.officialSourceAttempts.some(item => item.retrievalResult === 'timeout'));
  assert.ok(retry.officialSourceAttempts.every(item => item.legalTextRetrieved === false));

  assert.ok(retry.secondarySearchObservations.length >= 2);
  assert.ok(retry.secondarySearchObservations.every(item =>
    item.primarySourceVerified === false && item.releaseSourceEligible === false &&
    /secondary/.test(item.sourceClass)
  ));
  assert.equal(handoff.humanReview.status, 'not-reviewed');
  assert.equal(handoff.eventVersion.applicableToEventDate, 'not-determined');
});
