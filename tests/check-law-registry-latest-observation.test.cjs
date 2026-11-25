'use strict';
// Regression: the canonical cheque-law registry must not remain stale after a newer failed text fetch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/legal-source-registry-check.json'), 'utf8'));
const latest = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/check-law-qavanin-recheck-20261126.json'), 'utf8'));

test('canonical registry reflects the latest metadata-only Qavanin recheck without promoting the source', () => {
  assert.equal(registry.observations.metadataRecheckedAt, latest.observedAt);
  assert.equal(registry.observations.consolidatedTextLatestAttemptAt, latest.observedAt);
  assert.equal(registry.observations.latestSupplementalRecheck, 'docs/check-law-qavanin-recheck-20261126.json');
  assert.match(registry.observations.consolidatedTextLatestRecheck, /transfer\/interstitial/);
  assert.match(registry.observations.metadataLatestRecheck, /raw HTTP bytes and SHA-256 were not captured/);
  assert.equal(registry.status, 'research-only');
  assert.equal(registry.releaseSourceEligible, false);
  assert.equal(registry.legalConclusionPermitted, false);
  assert.equal(registry.humanReview, null);
});

test('latest portal label is not treated as a verified amendment date or event-date version', () => {
  assert.equal(latest.status, 'official-metadata-rendered-only');
  assert.equal(latest.verification.rawHttpResponseBytesCaptured, false);
  assert.equal(latest.verification.primarySourceVerified, false);
  assert.equal(latest.verification.humanReviewStatus, 'pending');
  assert.equal(latest.verification.eventDateVersioningApproved, false);
  assert.equal(latest.verification.legalAnswerUsePermitted, false);
  assert.equal(registry.observations.amendmentPublicationDatesVerified, false);
  assert.equal(registry.observations.amendmentEffectiveDatesVerified, false);
});
