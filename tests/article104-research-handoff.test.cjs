'use strict';
// A secondary legal research lead must never silently become a verified source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const handoff = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/article104-1403-research-handoff.json'), 'utf8'));

test('Article 104 handoff covers theft and fraud with concrete research leads', () => {
  assert.equal(handoff.schemaVersion, 1);
  assert.equal(handoff.status, 'research-only');
  assert.deepEqual(handoff.affectedPhase1Topics, ['theft', 'fraud']);
  assert.match(handoff.law, /۱۰۴/);
  assert.ok(handoff.secondaryLeads.length >= 2);
  for (const lead of handoff.secondaryLeads) {
    const url = new URL(lead.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(lead.publisher && lead.purpose);
    assert.ok(!['qavanin.ir', 'rc.majlis.ir', 'dotic.ir'].includes(url.hostname),
      'Secondary lead must not be misrepresented as a verified official source');
  }
  assert.ok(handoff.humanReviewQuestions.length >= 4);
});

test('unverified source, effective date and human review stay explicitly unset', () => {
  assert.match(handoff.warning, /Not verified/);
  for (const key of ['officialTextUrl', 'officialDocumentId', 'officialPublicationDate',
    'effectiveDate', 'amendmentsCheckedAt', 'humanReviewer']) {
    assert.equal(handoff[key], null, key + ' cannot be inferred from secondary sources');
  }
  assert.match(handoff.reportedChangeForReview, /No case-level conclusion/);
});

test('temporal advisory leads are explicitly secondary and cannot promote release coverage', () => {
  assert.equal(handoff.interpretiveLeads.length, 3);
  const numbers = handoff.interpretiveLeads.map(lead => lead.reportedOpinionNumber).sort();
  assert.deepEqual(numbers, ['7/1403/319', '7/1403/332', '7/1403/752']);
  for (const lead of handoff.interpretiveLeads) {
    assert.equal(lead.status, 'unverified-secondary');
    assert.match(lead.kind, /secondary/);
    assert.ok(/^https:\/\//.test(lead.url));
    assert.ok(lead.researchQuestion.length > 50);
  }
  assert.equal(handoff.officialTextUrl, null);
  assert.equal(handoff.effectiveDate, null);
  assert.equal(handoff.humanReviewer, null);
});

test('April parliamentary draft is not mistaken for the May enacted Article 104 amendment', () => {
  const caution = handoff.legislativeHistoryCaution;
  assert.equal(caution.status, 'unverified-secondary-comparison');
  assert.equal(caution.draftReportedDateJalali, '1403/01/28');
  assert.equal(caution.enactedReportedDateJalali, '1403/02/25');
  assert.match(caution.draftReportedAddition, /746/);
  assert.match(caution.enactedSecondaryTextDifference, /does not include.*746/);
  assert.match(caution.releaseWarning, /Do not cite.*draft.*enacted/i);
  for (const key of ['draftSecondaryUrl', 'enactedSecondaryUrl']) {
    assert.equal(new URL(caution[key]).protocol, 'https:');
  }
  // Research metadata cannot silently become a verified official citation.
  assert.equal(handoff.officialTextUrl, null);
  assert.equal(handoff.effectiveDate, null);
  assert.equal(handoff.humanReviewer, null);
});

test('newer temporal opinion remains an unverified lead and primary retrieval stays blocked', () => {
  const lead = handoff.interpretiveLeads.find(item => item.reportedOpinionNumber === '7/1403/332');
  assert.ok(lead);
  assert.equal(lead.reportedDateJalali, '1404/10/30');
  assert.equal(lead.status, 'unverified-secondary');
  assert.match(lead.researchQuestion, /original judiciary text/);
  assert.equal(handoff.officialRetrievalStatus.checkedAt, '2026-10-26');
  assert.equal(handoff.officialRetrievalStatus.status, 'primary-document-not-retrieved');
  assert.ok(handoff.officialRetrievalStatus.portalsSearched.includes('qavanin.ir'));
  assert.ok(handoff.officialRetrievalStatus.requiredNextEvidence.length >= 3);
  for (const key of ['officialTextUrl', 'officialDocumentId', 'officialPublicationDate',
    'effectiveDate', 'amendmentsCheckedAt', 'humanReviewer']) {
    assert.equal(handoff[key], null, key + ' must remain unverified');
  }
});
