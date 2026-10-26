'use strict';
// Candidate official URLs are research leads, not verified statutory citations.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handoff = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/check-law-source-handoff-20261026.json'), 'utf8'));

test('cheque-law research records a concrete official candidate while preserving legal-review blockers', () => {
  assert.equal(handoff.schemaVersion, 1);
  assert.equal(handoff.topic, 'check');
  assert.equal(handoff.status, 'research-only');
  assert.equal(handoff.observedAt, '2026-10-27');
  assert.match(handoff.warning, /not yet verified/i);
  assert.match(handoff.candidateOfficialDocument.url,
    /^https:\/\/qavanin\.ir\/Law\/TreeText\/\?IDS=[1-9]\d*$/);
  assert.equal(new URL(handoff.candidateOfficialDocument.discoveredFrom).hostname,
    'hoghogh.ai', 'candidate was found via a secondary source');
  assert.equal(handoff.candidateOfficialDocument.discoveryType, 'secondary-source-link');
  assert.equal(handoff.candidateOfficialDocument.observedResult, 'official-html-text-retrieved');
  assert.equal(handoff.candidateOfficialDocument.officialTextRetrieved, true);
  assert.equal(handoff.candidateOfficialDocument.documentIdConfirmedFromOfficialText, true);
});

test('no cheque-law retrieval lead is promoted to verified source or human sign-off', () => {
  assert.equal(handoff.releaseSourceEligible, false);
  assert.equal(handoff.officialTextUrl, handoff.candidateOfficialDocument.url);
  for (const key of ['officialPublicationDate', 'effectiveDate',
    'currentConsolidatedTextVerifiedAt', 'amendmentsCheckedAt',
    'humanReviewer', 'humanReviewedAt']) {
    assert.equal(handoff[key], null, key + ' requires independent primary evidence');
  }
  assert.equal(handoff.parliamentaryCrossChecks.length, 2);
  for (const lead of handoff.parliamentaryCrossChecks) {
    assert.equal(new URL(lead.url).hostname, 'rc.majlis.ir');
    assert.equal(lead.observedResult, 'request-timeout');
    assert.equal(lead.officialTextRetrieved, false);
  }
  assert.ok(handoff.reviewQuestions.length >= 4);
});

test('official HTML observation is recorded without claiming effective dates or release eligibility', () => {
  const observed = handoff.officialTextObservation;
  assert.equal(observed.retrievedAt, '2026-10-27');
  assert.equal(observed.source, 'primary-official-qavanin');
  assert.equal(observed.retrievalFormat, 'HTML-visible-law-text');
  assert.match(observed.lawTitleShown, /قانون صدور چك/);
  assert.equal(observed.approvalDateShown, '1355/04/16');
  for (const [article, date] of [['4', '1397/08/13'], ['6', '1400/01/29'],
    ['7', '1403/03/30'], ['23', '1397/08/13']]) {
    assert.ok(observed.amendmentDatesDisplayed.some(item =>
      item.article === article && item.date === date), article);
  }
  assert.equal(observed.sourceContentCopied, false);
  assert.match(observed.scope, /not a verified amendment history/i);
  assert.equal(handoff.currentConsolidatedTextVerifiedAt, null);
  assert.equal(handoff.amendmentsCheckedAt, null);
  assert.equal(handoff.effectiveDate, null);
  assert.equal(handoff.humanReviewer, null);
  assert.equal(handoff.humanReviewedAt, null);
  assert.equal(handoff.releaseSourceEligible, false);
});
