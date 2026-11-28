'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-1403-threshold-observation-20261121.json'), 'utf8'
));
const registry = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'
));

test('2026-11-21 official Qavanin recheck records the 1403 regulation and cheque Article 7 table', () => {
  assert.equal(observation.schema, 'dadyar-qavanin-check-1403-observation-v1');
  assert.equal(observation.observedAt, '2026-11-21');
  assert.equal(observation.status, 'research-only');
  assert.equal(observation.instrument.instrumentType, 'executive-regulation');
  assert.equal(observation.instrument.authorityShown, 'هیأت وزیران');
  assert.equal(observation.instrument.decisionNumberShown, '56261/ت62298هـ');
  assert.equal(observation.instrument.officialGazetteNumberShown, '23097');
  assert.equal(observation.instrument.officialGazettePublicationDateShown, '1403/04/23');
  assert.equal(observation.instrument.effectiveDateShown, '1403/05/08');
  assert.deepEqual(observation.instrument.chequeLawArticle7Table.renderedLines, [787, 793]);
  assert.deepEqual(observation.instrument.chequeLawArticle7Table.bandsInRial, {
    بند_الف: '780000000',
    بند_ب: { minimum: '780000000', maximum: '3900000000' },
    بند_ج: '3900000000'
  });
});

test('official portal date is recorded without promoting the secondary conflict to a legal conclusion', () => {
  assert.equal(observation.dateConflict.secondaryReportedEffectiveDate, '1403/05/07');
  assert.equal(observation.dateConflict.officialQavaninEffectiveDateShown, '1403/05/08');
  assert.match(observation.dateConflict.status, /original-gazette-bytes-and-independent-human-review-pending/);
  assert.equal(observation.primarySourceVerified, false);
  assert.equal(observation.humanReviewStatus, 'pending');
  assert.equal(observation.legalAnswerUsePermitted, false);
  assert.equal(observation.rawHttpBytesCaptured, false);
  assert.equal(observation.rawResponseSha256, null);
  assert.equal(observation.eventDateVersioningApproved, false);
  assert.deepEqual(observation.eventDateVersions, []);
});

test('registry preserves the 2026-11-21 observation while linking the fresh 2026-11-26 rendering', () => {
  const record = registry.records.find(item => item.id === 'check-issuance-law');
  const candidate = record.officialDocumentUrlCandidates.find(item => item.documentId === '634882870797924421');
  assert.ok(candidate);
  assert.equal(observation.observedAt, '2026-11-21');
  assert.equal(observation.instrument.textPageRendered, true);
  assert.equal(observation.rawHttpBytesCaptured, false);
  assert.match(candidate.lastDirectFetchResult, /Qavanin TreeText and Attribute pages for the 1403 executive regulation both rendered/);
  assert.equal(candidate.latestRecheck.observedAt, '2026-11-26');
  assert.equal(candidate.latestRecheck.textPageRendered, true);
  assert.equal(candidate.latestRecheck.metadataPageRendered, true);
  assert.equal(candidate.latestRecheck.officialGazetteNumberShown, '23097');
  assert.equal(candidate.latestRecheck.effectiveDateShown, '1403/05/08');
  assert.equal(candidate.latestRecheck.rawHttpBytesCaptured, false);
  assert.equal(candidate.latestRecheck.primarySourceVerified, false);
  assert.equal(candidate.latestRecheck.useInLegalAnswers, false);
  assert.equal(record.officialPortalObservation.latest1403Recheck.file,
    'docs/check-law-1403-threshold-observation-20261121.json');
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.useInLegalAnswers, false);
});
