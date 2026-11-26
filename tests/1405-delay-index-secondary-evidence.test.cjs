'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const canonical = JSON.parse(fs.readFileSync(path.join(root, 'dadyar-preview/data/delay-damages-index.json'), 'utf8'));
const observations = JSON.parse(fs.readFileSync(path.join(root, 'docs/1405-delay-index-secondary-observations-20261126.json'), 'utf8'));
const statusDoc = fs.readFileSync(path.join(root, 'docs/1405-delay-index-source-status.md'), 'utf8');

function byId(id) {
  const item = observations.observations.find(entry => entry.id === id);
  assert.ok(item, 'missing secondary observation: ' + id);
  return item;
}

test('secondary 1405 index observations remain non-primary and unauthorized for legal use', () => {
  assert.equal(observations.schema, 'dadyar-delay-index-secondary-observations-v1');
  assert.equal(observations.observedAt, '2026-11-26');
  assert.equal(observations.primarySourceVerified, false);
  assert.equal(observations.humanReviewStatus, 'pending');
  assert.equal(observations.useInLegalAnswers, false);
  assert.equal(observations.officialSourceCheck.primarySourceVerified, false);
  assert.equal(observations.officialSourceCheck.retrievalStatus, 'not-accessible-from-current-research-session');
  assert.ok(observations.observations.every(item => item.sourceClass === 'secondary-republication'));
  assert.ok(observations.observations.every(item => item.primarySourceVerified === false));
  assert.ok(observations.observations.every(item => item.humanReviewStatus === 'pending'));
  assert.ok(observations.observations.every(item => item.useInLegalAnswers === false));
});

test('conflicting secondary values are preserved as observations and never overwrite canonical owner-image values', () => {
  const vakilyar = byId('vakilyar-1405-07-30');
  const vakilsoal = byId('vakilsoal-live-row-1405');

  assert.equal(vakilyar.values['5'], 3323.9);
  assert.equal(vakilyar.values['6'], 3452.1);
  assert.ok(vakilyar.unavailableMonths.includes(7));
  assert.deepEqual(vakilyar.discrepancies, [
    { month: 5, ownerImage: 3333.9, secondary: 3323.9 },
    { month: 7, ownerImage: 3611.1, secondary: 'unpublished' }
  ]);

  assert.equal(vakilsoal.values['3'], 3093.5);
  assert.deepEqual(vakilsoal.discrepancies, [
    { month: 3, ownerImage: 3092.3, secondary: 3093.5 }
  ]);

  assert.equal(canonical.months['3'], 3092.3);
  assert.equal(canonical.months['5'], 3333.9);
  assert.equal(canonical.months['7'], 3611.1);
  assert.equal(canonical.source.status, 'transcribed-not-independently-authenticated');
  assert.deepEqual(canonical.unavailableMonths, [8, 9, 10, 11, 12]);
});

test('research status documentation identifies both mirrors and keeps the official-source gate closed', () => {
  assert.ok(statusDoc.includes(vakilyarUrl()));
  assert.ok(statusDoc.includes('vakilsoal.com'));
  assert.ok(statusDoc.includes('تعارض'));
  assert.ok(statusDoc.includes('بازبینی حقوقی مستقل'));
  assert.ok(statusDoc.includes('https://www.cbi.ir/showitem/35817.aspx'));
});

function vakilyarUrl() {
  return 'https://vakilyar-ai.com/article/late-payment-index-table/';
}
