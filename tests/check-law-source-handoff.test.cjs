'use strict';
// Candidate official URLs are research leads, not verified statutory citations.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handoff = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/check-law-source-handoff-20261026.json'), 'utf8'));

test('cheque-law research records a concrete official candidate without claiming text retrieval', () => {
  assert.equal(handoff.schemaVersion, 1);
  assert.equal(handoff.topic, 'check');
  assert.equal(handoff.status, 'research-only');
  assert.equal(handoff.observedAt, '2026-10-26');
  assert.match(handoff.warning, /not retrieved/i);
  assert.match(handoff.candidateOfficialDocument.url,
    /^https:\/\/qavanin\.ir\/Law\/TreeText\/\?IDS=[1-9]\d*$/);
  assert.equal(new URL(handoff.candidateOfficialDocument.discoveredFrom).hostname,
    'hoghogh.ai', 'candidate was found via a secondary source');
  assert.equal(handoff.candidateOfficialDocument.discoveryType, 'secondary-source-link');
  assert.equal(handoff.candidateOfficialDocument.observedResult, 'transfer-placeholder-only');
  assert.equal(handoff.candidateOfficialDocument.officialTextRetrieved, false);
  assert.equal(handoff.candidateOfficialDocument.documentIdConfirmedFromOfficialText, false);
});

test('no cheque-law retrieval lead is promoted to verified source or human sign-off', () => {
  assert.equal(handoff.releaseSourceEligible, false);
  for (const key of ['officialTextUrl', 'officialPublicationDate', 'effectiveDate',
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
