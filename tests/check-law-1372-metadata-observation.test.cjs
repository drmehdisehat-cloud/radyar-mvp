'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const register = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'));
const observation = JSON.parse(fs.readFileSync(path.join(root, 'docs/check-law-qavanin-observation-20261123.json'), 'utf8'));
const record = register.records.find(item => item.id === 'check-issuance-law');
const candidate = record.officialDocumentUrlCandidates.find(item => item.documentId === '16863897128756457315');

test('1372 cheque amendment has direct official Qavanin text and metadata links', () => {
  assert.equal(candidate.url, 'https://qavanin.ir/Law/TreeText/?IDS=16863897128756457315');
  assert.equal(candidate.officialAttributeUrl, 'https://qavanin.ir/Law/Attribute/?IDS=16863897128756457315');
  assert.equal(candidate.officialGazetteNumberShown, '14189');
  assert.equal(candidate.officialGazettePublicationDateShown, '1372/09/01');
  assert.equal(candidate.promulgationDateShown, '1372/08/25');
  assert.equal(candidate.effectiveFromShown, '1372/09/17');
});

test('1372 source observation binds visible lines and keeps raw-byte verification open', () => {
  assert.equal(observation.status, 'official-portal-observation-only');
  assert.equal(observation.observedAt, '2026-11-23');
  assert.deepEqual(observation.verification, {
    rawHttpBytesCaptured: false,
    rawResponseSha256: null,
    officialGazetteIssueBytesRetrieved: false,
    primarySourceVerified: false,
    humanReviewStatus: 'pending',
    eventDateVersioningApproved: false,
    legalAnswerUsePermitted: false
  });
  assert.ok(observation.source.textVisibleLines.includes(68));
  assert.ok(observation.source.metadataVisibleLines.includes(34));
  assert.equal(observation.source.officialGazetteNumberShown, '14189');
  assert.equal(observation.source.effectiveDateShown, '1372/09/17');
});

test('rendered 1372 metadata never activates legal-answer use or event-date versioning', () => {
  assert.equal(candidate.rawHttpBytesCaptured, false);
  assert.equal(candidate.rawResponseSha256, null);
  assert.equal(candidate.officialGazetteIssueBytesRetrieved, false);
  assert.equal(candidate.primarySourceVerified, false);
  assert.equal(candidate.humanReviewStatus, 'pending');
  assert.equal(candidate.eventDateVersioningApproved, false);
  assert.equal(candidate.useInLegalAnswers, false);
  assert.equal(record.latest1372Observation.file, 'docs/check-law-qavanin-observation-20261123.json');
  assert.equal(record.latest1372Observation.observedAt, '2026-11-23');
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
  assert.equal(register.policy.defaultUseInLegalAnswers, false);
});
