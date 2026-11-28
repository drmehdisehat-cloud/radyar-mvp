'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/check-law-1372-direct-observation-20261126.json'), 'utf8'
));
const registry = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/legal-source-registry-check.json'), 'utf8'
));

test('official Qavanin 1372 amendment observation is bound to its exact direct document URL', () => {
  assert.equal(observation.source.documentId, '16863897128756457315');
  assert.equal(
    observation.source.directTextUrl,
    'https://qavanin.ir/Law/TreeText/?IDS=16863897128756457315'
  );
  assert.equal(observation.source.textPageRendered, true);
  assert.equal(observation.source.approvalDateShown, '1372/08/11');
  assert.equal(observation.source.guardianCouncilConfirmationDateShown, '1372/08/19');
  assert.deepEqual(observation.source.textVisibleLines.slice(0, 3), [7, 9, 42]);
  assert.equal(observation.source.textVisibleLines.at(-1), 68);
});

test('rendered official text cannot be promoted without raw bytes, Gazette copy and independent review', () => {
  assert.equal(observation.source.rawHttpResponseBytesCaptured, false);
  assert.equal(observation.source.rawResponseSha256, null);
  assert.equal(observation.source.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.source.primarySourceVerified, false);
  assert.equal(observation.source.humanReviewStatus, 'pending');
  assert.equal(observation.source.eventDateVersioningApproved, false);
  assert.equal(observation.source.legalAnswerUsePermitted, false);
  assert.equal(registry.status, 'research-only');
  assert.equal(registry.textSha256, null);
  assert.equal(registry.releaseSourceEligible, false);
  assert.equal(registry.legalConclusionPermitted, false);
});

test('the observation does not claim a Gazette number or a current consolidated event-date version', () => {
  assert.equal(observation.source.officialGazetteNumber, null);
  assert.equal(observation.source.officialGazettePublicationDate, null);
  assert.match(observation.scope, /not the consolidated current law/);
  assert.ok(observation.limitations.some(item => /event date/i.test(item)));
});
