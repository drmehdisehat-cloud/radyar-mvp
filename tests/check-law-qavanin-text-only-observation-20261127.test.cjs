'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(path.join(root, 'docs/check-law-qavanin-text-only-observation-20261127.json'), 'utf8'));
const register = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'));
const canonical = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-registry-check.json'), 'utf8'));
const record = register.records.find(item => item.id === 'check-issuance-law');
const candidate = record.officialDocumentUrlCandidates.find(item => item.documentId === '11400475274213876131');

test('records the 2026-11-27 official consolidated cheque-law page as a text-only observation', () => {
  assert.equal(observation.observedAt, '2026-11-27');
  assert.equal(observation.status, 'official-consolidated-text-rendered-unhashed');
  assert.equal(observation.source.sourceClass, 'primary-official-qavanin');
  assert.equal(observation.source.directTextUrl, 'https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131');
  assert.equal(observation.source.textPageRendered, true);
  assert.deepEqual(observation.source.visibleLineRange, [42, 118]);
  assert.equal(observation.source.visibleArticle7Amendment.article, '7');
  assert.equal(observation.source.visibleArticle7Amendment.marker, 'اصلاحي 30ˏ03ˏ1403');
  assert.equal(observation.source.metadataPageRendered, false);
  assert.equal(observation.source.metadataRetrievalResult, 'timeout');
});

test('the new direct-page observation remains non-authorizing until bytes, Gazette, date versioning and human review are verified', () => {
  assert.equal(observation.source.rawHttpResponseBytesCaptured, false);
  assert.equal(observation.source.rawResponseSha256, null);
  assert.equal(observation.source.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.source.primarySourceVerified, false);
  assert.equal(observation.source.humanReviewStatus, 'pending');
  assert.equal(observation.source.eventDateVersioningApproved, false);
  assert.equal(observation.source.legalAnswerUsePermitted, false);
  assert.equal(observation.decision.registerStatus, 'research-only');
  assert.equal(observation.decision.releaseSourceEligible, false);
  assert.equal(observation.decision.legalConclusionPermitted, false);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
  assert.equal(candidate.primarySourceVerified, false);
  assert.equal(candidate.humanReviewStatus, 'pending');
  assert.equal(candidate.useInLegalAnswers, false);
  assert.equal(register.latestTextOnlyObservationFile, 'docs/check-law-qavanin-text-only-observation-20261127.json');
  assert.equal(record.latestRenderedTextObservation.file, register.latestTextOnlyObservationFile);
  assert.equal(candidate.latestRenderedTextObservationFile, register.latestTextOnlyObservationFile);
  assert.equal(canonical.observations.latestTextOnlyObservation.file, register.latestTextOnlyObservationFile);
  assert.equal(canonical.status, 'research-only');
  assert.equal(canonical.releaseSourceEligible, false);
  assert.equal(canonical.legalConclusionPermitted, false);
});
