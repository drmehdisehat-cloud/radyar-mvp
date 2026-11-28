'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const registry = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/legal-source-register-v1.json'), 'utf8'
));
const cheque = registry.records.find(item => item.id === 'check-issuance-law');
const amendment = cheque.officialPortalObservation.amendmentPages.find(
  item => item.id === 'check-amendment-1403'
);

test('fresh official 1403 cheque-threshold observation records rendered text and Gazette dates', () => {
  assert.equal(amendment.textRendered, 'yes');
  assert.equal(amendment.metadataRendered, true);
  assert.equal(amendment.officialGazetteNumber, '23097');
  assert.equal(amendment.publicationDate, '1403/04/23');
  assert.equal(amendment.promulgationDateShown, '1403/04/04');
  assert.equal(amendment.effectiveFrom, '1403/05/08');
  assert.match(amendment.renderedTextExcerpt, /ماده ۷/);
  assert.match(amendment.renderedTextExcerpt, /۳٬۹۰۰٬۰۰۰٬۰۰۰/);
});

test('rendered Qavanin pages do not promote the 1403 amendment to an approved legal source', () => {
  assert.equal(amendment.rawHttpBytesCaptured, false);
  assert.equal(amendment.rawResponseSha256, null);
  assert.equal(amendment.officialGazetteIssueBytesRetrieved, false);
  assert.equal(amendment.primarySourceVerified, false);
  assert.equal(amendment.humanReviewStatus, 'pending');
  assert.equal(amendment.useInLegalAnswers, false);
  assert.equal(cheque.primarySourceVerified, false);
  assert.equal(cheque.humanReviewStatus, 'pending');
  assert.equal(cheque.useInLegalAnswers, false);
  assert.equal(cheque.latest1403Recheck.legalAnswerUsePermitted, false);
});

test('original 1355 act commencement is not confused with the 1403 regulation effective date', () => {
  assert.equal(cheque.officialPortalObservation.originalLawMetadata.originalEffectiveDateShown, '1355/06/04');
  assert.equal(amendment.effectiveFrom, '1403/05/08');
  assert.notEqual(
    cheque.officialPortalObservation.originalLawMetadata.originalEffectiveDateShown,
    amendment.effectiveFrom
  );
});
