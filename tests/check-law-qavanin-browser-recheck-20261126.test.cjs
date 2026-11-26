'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(path.join(root, 'docs/check-law-qavanin-browser-recheck-20261126.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-registry-check.json'), 'utf8'));
const register = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'));
const record = register.records.find(item => item.id === 'check-issuance-law');
const candidate = record.officialDocumentUrlCandidates.find(item => item.documentId === '11400475274213876131');

test('records the newly rendered consolidated Qavanin text page without upgrading source eligibility', () => {
  const source = observation.sources.consolidatedChequeLaw;
  assert.equal(observation.observedAt, '2026-11-26');
  assert.equal(observation.status, 'official-consolidated-text-rendered-unhashed');
  assert.equal(source.textPageRendered, true);
  assert.deepEqual(source.visibleLineRange, [42, 113]);
  assert.equal(source.metadataPageRendered, true);
  assert.equal(source.metadata.officialGazetteNumberShown, '9210');
  assert.equal(source.metadata.latestStatusShown, 'اصلاحي 1403/03/30');
  assert.equal(source.rawHttpResponseBytesCaptured, false);
  assert.equal(source.rawResponseSha256, null);
  assert.equal(source.officialGazetteIssueBytesRetrieved, false);
  assert.equal(source.primarySourceVerified, false);
  assert.equal(source.humanReviewStatus, 'pending');
  assert.equal(source.eventDateVersioningApproved, false);
  assert.equal(source.legalAnswerUsePermitted, false);
});

test('the separate 1403 amendment endpoint remains unverified and the live register remains research-only', () => {
  const amendment = observation.sources.amendment1403SeparateText;
  assert.equal(amendment.textPageRendered, false);
  assert.equal(amendment.textPageResult, 'transfer-interstitial');
  assert.equal(registry.status, 'research-only');
  assert.equal(registry.releaseSourceEligible, false);
  assert.equal(registry.legalConclusionPermitted, false);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
  assert.equal(candidate.latestTextObservation.observedAt, '2026-11-26');
  assert.equal(candidate.latestTextObservation.useInLegalAnswers, false);
  assert.equal(register.latestSupplementalObservationFile, 'docs/check-law-qavanin-browser-recheck-20261126.json');
});
