'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/uniform-opinion-883-source-observation-20261120.json'), 'utf8'
));
const register = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'
));
const record = register.records.find(item => item.id === 'uniform-opinion-883');

test('opinion 883 current secondary leads remain explicitly non-authorizing', () => {
  assert.ok(record, 'opinion 883 research record must exist');
  assert.equal(observation.schema, 'dadyar-uniform-opinion-source-observation-v1');
  assert.equal(observation.observedAt, '2026-11-20');
  assert.equal(observation.authorityId, 'uniform-opinion-883-1405-07-21');
  assert.equal(observation.reportedDecisionDateJalali, '1405/07/21');
  assert.equal(observation.primarySourceVerified, false);
  assert.equal(observation.primaryOfficialDocumentUrl, null);
  assert.equal(observation.rawPrimaryBytesCaptured, false);
  assert.equal(observation.primaryTextSha256, null);
  assert.equal(observation.eventVersion.applicableToEventDate, 'not-determined');
  assert.equal(observation.eventDateVersioningApproved, false);
  assert.equal(observation.humanReviewStatus, 'pending');
  assert.equal(observation.useInLegalAnswers, false);
  assert.equal(observation.legalConclusionPermitted, false);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
});

test('secondary reports cannot be mistaken for an official gazette record', () => {
  assert.equal(observation.officialGazettePublicationStatus, 'secondary-claim-only');
  assert.ok(observation.secondaryObservations.length >= 2);
  assert.ok(observation.secondaryObservations.every(item =>
    item.sourceClass === 'secondary' && item.claimStatus !== 'primary-verified'
  ));
  assert.equal(observation.identifierDiscrepancy.status, 'unreconciled');
  assert.deepEqual(
    observation.identifierDiscrepancy.claims.map(item => item.value).sort(),
    ['1404/2', '2/1405'].sort()
  );
});

test('official portal access limitations are not described as proof that no official record exists', () => {
  const qavanin = observation.officialChannelChecks.find(item => item.authority === 'سامانه ملی قوانین و مقررات');
  const gazette = observation.officialChannelChecks.find(item => item.authority === 'روزنامه رسمی جمهوری اسلامی ایران');
  assert.ok(qavanin);
  assert.match(qavanin.result, /no direct internal search.*completed/);
  assert.ok(gazette);
  assert.match(gazette.result, /timeout/);
  assert.match(gazette.interpretation, /نبود سند.*ثابت نمی‌کند/);
});

test('reported rule is clearly marked as a secondary summary and excluded from legal-answer use', () => {
  assert.match(observation.reportedRuleSummary, /منابع ثانویه گزارش می‌کنند/);
  assert.match(observation.reportedRuleSummary, /نتیجه حقوقی تأییدشده نیست/);
  assert.match(observation.scope, /هیچ متن یا خلاصه ثانویه‌ای.*ارتقا داده نشده/);
});
