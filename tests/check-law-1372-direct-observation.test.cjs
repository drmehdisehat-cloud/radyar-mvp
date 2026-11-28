'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-1372-direct-observation-20261122.json'),
  'utf8'
));
const register = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-register-v1.json'),
  'utf8'
));
const cheque = register.records.find(item => item.id === 'check-issuance-law');
const candidate = cheque.officialDocumentUrlCandidates.find(
  item => item.documentId === '16863897128756457315'
);

test('1372 cheque amendment records a fresh direct official Qavanin text observation', () => {
  assert.equal(observation.schema, 'dadyar-qavanin-direct-observation-v1');
  assert.equal(observation.status, 'official-rendered-text-observation-only');
  assert.equal(observation.source.sourceClass, 'primary-official-qavanin');
  assert.equal(observation.source.documentId, '16863897128756457315');
  assert.equal(
    observation.source.directTextUrl,
    'https://qavanin.ir/Law/TreeText/?IDS=16863897128756457315'
  );
  assert.equal(observation.source.approvalDateShown, '1372/08/11');
  assert.equal(observation.source.guardianCouncilConfirmationDateShown, '1372/08/19');
  assert.equal(observation.source.textPageRendered, true);
  assert.ok(observation.source.textVisibleLines.includes(7));
  assert.ok(observation.source.textVisibleLines.includes(9));
  assert.ok(observation.source.textVisibleLines.includes(68));
});

test('metadata retrieval gaps are explicit and never inferred from approval dates', () => {
  assert.equal(observation.source.metadataPageAttempted, true);
  assert.equal(observation.source.metadataPageAccessibleInThisRun, false);
  assert.equal(observation.source.officialGazetteNumberShown, null);
  assert.equal(observation.source.officialGazettePublicationDateShown, null);
  assert.equal(observation.source.promulgationDateShown, null);
  assert.equal(observation.source.effectiveDateShown, null);
});

test('rendered official text remains research-only until raw bytes, Gazette issue and human review are pinned', () => {
  assert.equal(observation.verification.rawHttpBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);
  assert.ok(candidate, '1372 amendment candidate missing from the legal register');
  assert.equal(candidate.lastDirectFetchAt, '2026-11-25');
  assert.equal(candidate.latestTextObservation.observedAt, '2026-11-25');
  assert.equal(candidate.latestMetadataObservation.observedAt, '2026-11-25');
  assert.equal(candidate.rawHttpBytesCaptured, false);
  assert.equal(candidate.rawResponseSha256, null);
  assert.equal(candidate.officialGazetteIssueBytesRetrieved, false);
  assert.equal(candidate.humanReviewStatus, 'pending');
  assert.equal(candidate.eventDateVersioningApproved, false);
  assert.equal(candidate.useInLegalAnswers, false);
  assert.equal(cheque.primarySourceVerified, false);
  assert.equal(cheque.humanReviewStatus, 'pending');
  assert.equal(cheque.useInLegalAnswers, false);
});
