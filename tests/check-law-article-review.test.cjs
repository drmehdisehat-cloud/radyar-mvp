'use strict';
// Source observations are research leads only. No legal conclusions or client data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/check-law-article-review-20261028.json'), 'utf8'));

test('official cheque-law article observations are traceable and scoped', () => {
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.topic, 'check');
  assert.equal(evidence.status, 'research-only');
  assert.equal(evidence.observedAt, '2026-10-28');
  assert.match(evidence.officialTextUrl, /^https:\/\/qavanin\.ir\/Law\/TreeText\/\?IDS=[1-9]\d*$/);
  assert.equal(evidence.officialMetadataUrl,
    evidence.officialTextUrl.replace('/Law/TreeText/', '/Law/Attribute/'));
  assert.deepEqual(evidence.articles.map(a => a.article),
    ['4', '5', '7', '11', '13', '21bis_note1', '23']);
  assert.equal(evidence.originalLawMetadata.originalGazetteNumberShown, '9210');
  assert.equal(evidence.originalLawMetadata.appliesToAmendments, false);
  assert.equal(evidence.originalLawMetadata.originalEffectiveDateShown, '1355/06/04');
  assert.equal(evidence.articles.find(a => a.article === '7').amendmentLabelShown, '1403/03/30');
  assert.equal(evidence.articles.find(a => a.article === '21bis_note1').amendmentLabelShown, '1400/01/29');
});

test('article labels never count as verified amendment effective dates or sign-off', () => {
  assert.equal(evidence.releaseSourceEligible, false);
  for (const field of ['amendmentHistoryVerifiedAt', 'humanReviewedAt', 'humanReviewer']) {
    assert.equal(evidence[field], null);
  }
  for (const article of evidence.articles) {
    assert.match(article.amendmentLabelShown, /^\d{4}\/\d{2}\/\d{2}$/);
    assert.ok(article.reviewTask.length > 30);
    for (const field of ['amendmentGazetteNumber', 'amendmentGazettePublishedAt',
      'amendmentEffectiveDate', 'humanReviewedAt', 'humanReviewer']) {
      assert.equal(article[field], null, article.article + ':' + field);
    }
    assert.equal(article.transitionalRulesVerified, false, article.article);
    assert.equal(article.releaseSourceEligible, false, article.article);
  }
  assert.match(evidence.nextAction, /official gazette/i);
});
