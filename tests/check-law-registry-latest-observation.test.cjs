'use strict';
// Regression: metadata and amendment-text observations must remain distinct.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/legal-source-registry-check.json'), 'utf8'));
const metadataRecheck = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/check-law-qavanin-recheck-20261126.json'), 'utf8'));
const browserObservation = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/check-law-qavanin-browser-recheck-20261126.json'), 'utf8'));
const amendmentObservation = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/check-law-1372-direct-observation-20261126.json'), 'utf8'));

test('canonical registry keeps consolidated-law metadata recheck separate from the 1372 amendment text observation', () => {
  assert.equal(registry.observations.metadataRecheckedAt, metadataRecheck.observedAt);
  assert.equal(registry.observations.consolidatedTextLatestAttemptAt, metadataRecheck.observedAt);
  assert.equal(registry.observations.latestSupplementalRecheck, 'docs/check-law-qavanin-browser-recheck-20261126.json');
  assert.equal(registry.observations.latestAmendmentTextObservation, 'docs/check-law-1372-direct-observation-20261126.json');
  assert.match(registry.observations.consolidatedTextLatestRecheck, /TreeText page rendered/);
  assert.match(registry.observations.metadataLatestRecheck, /raw HTTP bytes and SHA-256 were not captured/);
  assert.equal(metadataRecheck.status, 'official-metadata-rendered-only');
  assert.equal(metadataRecheck.sources.consolidatedChequeLaw.textPageRendered, false);
  assert.equal(browserObservation.sources.consolidatedChequeLaw.textPageRendered, true);
  assert.equal(browserObservation.sources.consolidatedChequeLaw.rawHttpResponseBytesCaptured, false);
  assert.equal(browserObservation.sources.consolidatedChequeLaw.legalAnswerUsePermitted, false);
  assert.equal(registry.observations.latestBrowserTextObservation, 'docs/check-law-qavanin-browser-recheck-20261126.json');
  assert.equal(registry.status, 'research-only');
  assert.equal(registry.releaseSourceEligible, false);
  assert.equal(registry.legalConclusionPermitted, false);
  assert.equal(registry.humanReview, null);
});

test('rendered 1372 amendment text is observed but not verified or approved for legal answers', () => {
  assert.equal(amendmentObservation.status, 'official-rendered-text-observation-only');
  assert.equal(amendmentObservation.source.documentId, '16863897128756457315');
  assert.equal(amendmentObservation.source.textPageRendered, true);
  assert.equal(amendmentObservation.source.approvalDateShown, '1372/08/11');
  assert.equal(amendmentObservation.source.guardianCouncilConfirmationDateShown, '1372/08/19');
  assert.equal(amendmentObservation.verification.rawHttpResponseBytesCaptured, false);
  assert.equal(amendmentObservation.verification.rawResponseSha256, null);
  assert.equal(amendmentObservation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(amendmentObservation.verification.primarySourceVerified, false);
  assert.equal(amendmentObservation.verification.humanReviewStatus, 'pending');
  assert.equal(amendmentObservation.verification.eventDateVersioningApproved, false);
  assert.equal(amendmentObservation.verification.legalAnswerUsePermitted, false);
  const row = registry.observations.amendmentTextObservations.find(item =>
    item.documentId === amendmentObservation.source.documentId
  );
  assert.ok(row);
  assert.equal(row.textRendered, true);
  assert.equal(row.rawBytesCaptured, false);
  assert.equal(row.sha256, null);
  assert.equal(registry.observations.amendmentPublicationDatesVerified, false);
  assert.equal(registry.observations.amendmentEffectiveDatesVerified, false);
});
