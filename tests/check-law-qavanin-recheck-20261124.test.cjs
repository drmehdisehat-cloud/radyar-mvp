'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-qavanin-recheck-20261124.json'), 'utf8'
));
const register = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'
));
const cheque = register.records.find(item => item.id === 'check-issuance-law');

test('records the 2026-11-24 direct official Qavanin text and metadata render observations', () => {
  assert.equal(observation.schema, 'dadyar-qavanin-supplemental-recheck-v1');
  assert.equal(observation.observedAt, '2026-11-24');
  assert.equal(observation.status, 'official-rendered-observation-only');

  const consolidated = observation.sources.consolidatedLaw;
  assert.equal(consolidated.sourceClass, 'primary-official-qavanin');
  assert.equal(consolidated.documentId, '11400475274213876131');
  assert.equal(consolidated.directTextUrl,
    'https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131');
  assert.equal(consolidated.directMetadataUrl,
    'https://qavanin.ir/Law/Attribute/?IDS=11400475274213876131');
  assert.equal(consolidated.textPageRendered, true);
  assert.ok(consolidated.textVisibleLines.includes(83));
  assert.ok(consolidated.textVisibleLines.includes(105));
  assert.equal(consolidated.metadataPageRendered, true);
  assert.equal(consolidated.originalGazetteNumberShown, '9210');
  assert.equal(consolidated.latestStatusLabelShown, 'اصلاحي 1403/03/30');

  const amendment = observation.sources.amendment1372;
  assert.equal(amendment.sourceClass, 'primary-official-qavanin');
  assert.equal(amendment.documentId, '16863897128756457315');
  assert.equal(amendment.directTextUrl,
    'https://qavanin.ir/Law/TreeText/?IDS=16863897128756457315');
  assert.equal(amendment.textPageRendered, true);
  assert.ok(amendment.textVisibleLines.includes(68));
  assert.equal(amendment.approvalDateShown, '1372/08/11');
  assert.equal(amendment.guardianCouncilConfirmationDateShown, '1372/08/19');
  assert.equal(amendment.metadataPageAttempted, true);
  assert.equal(amendment.metadataPageRendered, true);
  assert.deepEqual(amendment.metadataVisibleLines, [7,9,19,21,22,23,24,25,26,27,29,30,31,32,33,34]);
  assert.equal(amendment.metadataFailure, null);
  assert.equal(amendment.previousMetadataFailure, 'timeout');
  assert.equal(amendment.lastSuccessfulMetadataObservationAt, '2026-11-24');
  assert.equal(amendment.metadataObservation.officialGazetteNumberShown, '14189');
  assert.equal(amendment.metadataObservation.officialGazettePublicationDateShown, '1372/09/01');
  assert.equal(amendment.metadataObservation.promulgationDateShown, '1372/08/25');
  assert.equal(amendment.metadataObservation.effectiveDateShown, '1372/09/17');
  assert.equal(amendment.metadataObservation.notificationNumberShown, '52663');
});

test('a rendered page or a prior metadata observation never promotes a source to answer-eligible status', () => {
  assert.equal(observation.verification.rawHttpResponseBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);

  assert.equal(cheque.primarySourceVerified, false);
  assert.equal(cheque.humanReviewStatus, 'pending');
  assert.equal(cheque.useInLegalAnswers, false);
  assert.equal(register.policy.defaultUseInLegalAnswers, false);
  assert.equal(register.latestSupplementalObservationFile,
    'docs/check-law-qavanin-recheck-20261125.json');
  assert.equal(register.lastSupplementalObservationAt, '2026-11-25');
  assert.ok(cheque.supplementalObservationAttempts.some(item =>
    item.file === 'docs/check-law-qavanin-recheck-20261124.json' &&
    item.observedAt === '2026-11-24' &&
    item.useInLegalAnswers === false
  ));
});
