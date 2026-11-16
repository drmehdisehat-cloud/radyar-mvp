'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { auditLegalSourceRegister, directOfficialDocumentUrl } = require('../backend/legal-source-register-policy.cjs');

const root = path.join(__dirname, '..');
const register = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'));
const HASH = 'a'.repeat(64);

function approvedRecord(overrides = {}) {
  const version = {
    id: 'check-law-v1',
    officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=12345',
    documentId: '12345',
    publicationIssue: 'روزنامه رسمی شماره ۲۳۰۰۰ (داده ساختگی آزمون)',
    publicationDate: '2020-01-01',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    retrievedAt: '2026-11-15',
    textSha256: HASH,
    humanReview: {
      reviewer: 'بازبین حقوقی مستقل آزمون',
      reviewedAt: '2026-11-16',
      decision: 'approved',
      reviewedTextSha256: HASH
    }
  };
  return {
    id: 'synthetic-check-law',
    primarySourceVerified: true,
    humanReviewStatus: 'approved',
    useInLegalAnswers: true,
    eventDateVersions: [version],
    ...overrides
  };
}

function registry(records) {
  return { schema: 'dadyar-legal-source-register-v1', observedAt: '2026-11-16', records };
}

test('current research register remains valid but promotes no unverified record into legal answers', () => {
  const result = auditLegalSourceRegister(register);
  assert.equal(result.valid, true, result.issues.join('\n'));
  assert.deepEqual(result.answerEligibleRecordIds, []);
  assert.equal(result.structuralOnly, true);
});

test('a future source can be promoted only with a direct official document, event-date version and hash-bound human review', () => {
  const result = auditLegalSourceRegister(registry([approvedRecord()]));
  assert.equal(result.valid, true, result.issues.join('\n'));
  assert.deepEqual(result.answerEligibleRecordIds, ['synthetic-check-law']);
});

test('secondary hosts, portal homepages and mismatched document IDs are not direct primary documents', () => {
  assert.equal(directOfficialDocumentUrl('https://example.org/law/12345', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=123456', '12345'), false);
  const record = approvedRecord({ eventDateVersions: [
    { ...approvedRecord().eventDateVersions[0], officialDocumentUrl: 'https://example.org/law/12345' }
  ] });
  const result = auditLegalSourceRegister(registry([record]));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.includes('not_a_direct_allowlisted_official_document_url')));
});

test('a source cannot be answer-eligible without an approved review bound to the exact text hash', () => {
  const record = approvedRecord();
  record.eventDateVersions[0].humanReview.reviewedTextSha256 = 'b'.repeat(64);
  const result = auditLegalSourceRegister(registry([record]));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.includes('review_not_bound_to_exact_text_hash')));
  assert.deepEqual(result.answerEligibleRecordIds, []);
});

test('a source marked for answer use is rejected when the primary source or human review is not approved', () => {
  const unverified = approvedRecord({ primarySourceVerified: false });
  const pending = approvedRecord({ humanReviewStatus: 'pending' });
  for (const record of [unverified, pending]) {
    const result = auditLegalSourceRegister(registry([record]));
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.includes('answer_use_requires_verified_primary_source_and_approved_review')));
  }
});


test('global register errors clear all answer-eligible IDs', () => {
  const record = approvedRecord();
  const badDate = auditLegalSourceRegister({ ...registry([record]), observedAt: '2026-02-30' });
  assert.equal(badDate.valid, false);
  assert.deepEqual(badDate.answerEligibleRecordIds, []);

  const badDefault = auditLegalSourceRegister({
    ...registry([record]),
    policy: { defaultUseInLegalAnswers: true }
  });
  assert.equal(badDefault.valid, false);
  assert.deepEqual(badDefault.answerEligibleRecordIds, []);
});

test('invalid dates and overlapping event-date versions fail closed', () => {
  const invalid = approvedRecord();
  invalid.eventDateVersions[0].effectiveFrom = '2024-02-30';
  assert.equal(auditLegalSourceRegister(registry([invalid])).valid, false);

  const overlap = approvedRecord();
  overlap.eventDateVersions.push({
    ...overlap.eventDateVersions[0], id: 'check-law-v2',
    officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=12346', documentId: '12346',
    effectiveFrom: '2024-01-01'
  });
  const result = auditLegalSourceRegister(registry([overlap]));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.includes('overlapping_event_date_versions')));
});
