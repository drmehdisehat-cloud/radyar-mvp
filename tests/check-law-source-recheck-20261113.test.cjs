'use strict';
// This test records failed official-source retrieval without promoting secondary material.
// It deliberately protects the legal-answer boundary; it does not validate legal text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/check-law-source-handoff-20261026.json'), 'utf8'
));

test('13 Nov official cheque-law retry remains research-only after primary endpoints time out', () => {
  assert.equal(record.status, 'research-only');
  assert.equal(record.releaseSourceEligible, false);
  assert.equal(record.legalConclusionPermitted, false);
  const retry = record.latestOfficialSourceRetry;
  assert.equal(retry.observedAt, '2026-11-13');
  assert.equal(retry.officialSourceAttempts.length, 4);
  for (const attempt of retry.officialSourceAttempts) {
    assert.match(attempt.url, /^https:\/\//);
    assert.equal(attempt.retrievalResult, 'timeout');
    assert.equal(attempt.textRetrieved, false);
  }
  assert.equal(retry.secondaryDiscoveryOnly.role, 'secondary index / discovery lead only');
  assert.equal(retry.secondaryDiscoveryOnly.legalTextImported, false);
  assert.equal(retry.secondaryDiscoveryOnly.releaseSourceEligible, false);
  assert.equal(record.officialPublicationDate, null);
  assert.equal(record.effectiveDate, null);
  assert.equal(record.humanReviewer, null);
  assert.equal(record.humanReviewedAt, null);
});
