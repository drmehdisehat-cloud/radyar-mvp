'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const record = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../research/check-law-2017-secondary-observation-20261112.json'),
  'utf8'
));

test('secondary cheque-law date observation stays research-only and cannot enter legal answers', () => {
  assert.equal(record.schema, 'dadyar-legal-source-observation-v1');
  assert.equal(record.source_role, 'secondary_reproduction_only');
  assert.equal(record.status, 'research_only');
  assert.equal(record.approved_for_legal_answer, false);
  assert.equal(record.human_review_status, 'not_reviewed');
  assert.equal(record.source.authenticity_verified, false);
  assert.match(record.source.url, /^https:\/\/www\.tasnimnews\.ir\//);
  assert.equal(record.unresolved_official_metadata.official_gazette_document_url, null);
  assert.equal(record.unresolved_official_metadata.official_gazette_issue_number, null);
  assert.equal(record.unresolved_official_metadata.official_publication_date, null);
  assert.equal(record.unresolved_official_metadata.legal_commencement_date, null);
  assert.equal(record.unresolved_official_metadata.applicable_version_for_event_date, null);
  assert.ok(record.next_required_evidence.includes('Document-specific official gazette record and authentic publication copy'));
});

test('reported dates remain attributed to the secondary source and are not promoted to official dates', () => {
  assert.equal(record.source_reported_dates.parliamentary_approval, '1397/08/13');
  assert.equal(record.source_reported_dates.guardian_council_approval, '1397/08/23');
  assert.equal(record.source_reported_dates.parliament_letter_received, '1397/08/29');
  assert.equal(record.source_reported_dates.presidential_communication_reported, '1397/09/03');
  assert.equal(record.unresolved_official_metadata.official_publication_date, null);
  assert.ok(record.limitations.some(item => /secondary news source/.test(item)));
  assert.ok(record.limitations.some(item => /must not be cited as proof/.test(item)));
});
