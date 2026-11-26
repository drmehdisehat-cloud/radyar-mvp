'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-registry-check.json'), 'utf8'
));
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-1372-direct-observation-20261126.json'), 'utf8'
));
const documentId = '16863897128756457315';

test('rendered 1372 Qavanin amendment is reconciled into the cheque registry exactly once', () => {
  const matches = registry.observations.amendmentTextObservations.filter(
    item => item.documentId === documentId
  );
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], {
    documentId,
    approvalDateShown: '1372/08/11',
    guardianCouncilConfirmationDateShown: '1372/08/19',
    textRendered: true,
    rawBytesCaptured: false,
    sha256: null,
    metadataUrl: 'https://qavanin.ir/Law/Attribute/?IDS=16863897128756457315',
    metadataRendered: false,
    metadataRetrievalResult: 'transfer-interstitial',
    officialGazetteNumberShown: null,
    officialGazetteDateShown: null,
    promulgationDateShown: null,
    effectiveFromShown: null
  });
  assert.equal(
    registry.observations.latestSupplementalRecheck,
    'docs/check-law-1372-direct-observation-20261126.json'
  );
});

test('the 1372 rendered page observation cannot promote the cheque law into answer-eligible sources', () => {
  assert.equal(observation.source.documentId, documentId);
  assert.equal(observation.source.textPageRendered, true);
  assert.equal(observation.source.rawHttpResponseBytesCaptured, false);
  assert.equal(observation.source.rawResponseSha256, null);
  assert.equal(observation.source.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.source.primarySourceVerified, false);
  assert.equal(observation.source.humanReviewStatus, 'pending');
  assert.equal(observation.source.eventDateVersioningApproved, false);
  assert.equal(observation.source.legalAnswerUsePermitted, false);

  assert.equal(registry.status, 'research-only');
  assert.equal(registry.releaseSourceEligible, false);
  assert.equal(registry.legalConclusionPermitted, false);
  assert.equal(registry.humanReview, null);
  assert.ok(registry.evidenceGaps.some(item => item.includes('بایت خام')));
  assert.ok(registry.evidenceGaps.some(item => item.includes('فراداده اختصاصی')));
});
