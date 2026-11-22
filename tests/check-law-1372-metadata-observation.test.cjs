'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const register = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'
));
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-qavanin-observation-20261122.json'), 'utf8'
));
const cheque = register.records.find(item => item.id === 'check-issuance-law');
const candidate = cheque.officialDocumentUrlCandidates.find(
  item => item.documentId === '16863897128756457315'
);
const amendment = observation.sources.amendment1372;

test('1372 cheque amendment has a direct official text and metadata observation', () => {
  assert.ok(candidate, '1372 official Qavanin candidate missing');
  assert.equal(candidate.url, 'https://qavanin.ir/Law/TreeText/?IDS=16863897128756457315');
  assert.equal(candidate.officialAttributeUrl, 'https://qavanin.ir/Law/Attribute/?IDS=16863897128756457315');
  assert.equal(candidate.officialGazetteNumberShown, '14189');
  assert.equal(candidate.officialGazettePublicationDateShown, '1372/09/01');
  assert.equal(candidate.promulgationDateShown, '1372/08/25');
  assert.equal(candidate.effectiveFromShown, '1372/09/17');
  assert.equal(candidate.metadataLastDirectFetchAt, '2026-11-22');
});

test('rendered 1372 metadata never promotes the amendment to an approved legal source', () => {
  assert.equal(candidate.rawHttpBytesCaptured, false);
  assert.equal(candidate.rawResponseSha256, null);
  assert.equal(candidate.officialGazetteIssueBytesRetrieved, false);
  assert.equal(candidate.humanReviewStatus, 'pending');
  assert.equal(candidate.useInLegalAnswers, false);
  assert.equal(cheque.primarySourceVerified, false);
  assert.equal(cheque.humanReviewStatus, 'pending');
  assert.equal(cheque.useInLegalAnswers, false);
});

test('the dated observation binds visible text and metadata lines while retaining all release limits', () => {
  assert.equal(observation.status, 'official-portal-observation-only');
  assert.equal(amendment.documentId, '16863897128756457315');
  assert.deepEqual(amendment.metadata, {
    officialGazetteNumberShown: '14189',
    officialGazettePublicationDateShown: '1372/09/01',
    promulgationDateShown: '1372/08/25',
    effectiveDateShown: '1372/09/17'
  });
  assert.ok(amendment.textVisibleLines.includes(68));
  assert.ok(amendment.metadataVisibleLines.includes(34));
  assert.equal(amendment.rawHttpBytesCaptured, false);
  assert.equal(amendment.primarySourceVerified, false);
  assert.equal(amendment.humanReviewStatus, 'pending');
  assert.equal(amendment.eventDateVersioningApproved, false);
  assert.equal(amendment.legalAnswerUsePermitted, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);
});
