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
    rawResponse: {
      url: 'https://qavanin.ir/Law/TreeText/?IDS=12345',
      status: 200,
      byteLength: 4096,
      sha256: HASH,
      capturedAt: '2026-11-15'
    },
    humanReview: {
      reviewer: 'بازبین حقوقی مستقل آزمون',
      reviewedAt: '2026-11-16',
      decision: 'approved',
      reviewedTextSha256: HASH,
      reviewedRawResponseSha256: HASH
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
  return { schema: 'dadyar-legal-source-register-v1', observedAt: '2026-11-16', policy: { defaultUseInLegalAnswers: false }, records };
}

test('current research register remains valid but promotes no unverified record into legal answers', () => {
  const result = auditLegalSourceRegister(register);
  assert.equal(result.valid, true, result.issues.join('\n'));
  assert.deepEqual(result.answerEligibleRecordIds, []);
  assert.equal(result.structuralOnly, true);
});

test('structurally complete metadata never authorizes a legal answer without authenticated source and reviewer evidence', () => {
  const result = auditLegalSourceRegister(registry([approvedRecord()]));
  assert.equal(result.valid, true, result.issues.join('\n'));
  assert.deepEqual(result.structurallyCompleteRecordIds, ['synthetic-check-law']);
  assert.deepEqual(result.answerEligibleRecordIds, []);
  assert.equal(result.structuralOnly, true);
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
  assert.deepEqual(badDate.structurallyCompleteRecordIds, []);
  assert.deepEqual(badDate.answerEligibleRecordIds, []);

  const badDefault = auditLegalSourceRegister({
    ...registry([record]),
    policy: { defaultUseInLegalAnswers: true }
  });
  assert.equal(badDefault.valid, false);
  assert.deepEqual(badDefault.structurallyCompleteRecordIds, []);
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
    rawResponse: { ...overlap.eventDateVersions[0].rawResponse, url: 'https://qavanin.ir/Law/TreeText/?IDS=12346' },
    effectiveFrom: '2024-01-01'
  });
  const result = auditLegalSourceRegister(registry([overlap]));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.includes('overlapping_event_date_versions')));
});
 
test('requires a document-specific raw HTTP response capture before a source can be structurally complete', () => {
  const cases = [
    ['missing raw response', record => { delete record.eventDateVersions[0].rawResponse; }, 'raw_response_missing'],
    ['different response URL', record => { record.eventDateVersions[0].rawResponse.url = 'https://qavanin.ir/Law/TreeText/?IDS=99999'; }, 'raw_response_url_mismatch'],
    ['redirect response', record => { record.eventDateVersions[0].rawResponse.status = 302; }, 'raw_response_http_status_not_200'],
    ['empty response', record => { record.eventDateVersions[0].rawResponse.byteLength = 0; }, 'invalid_raw_response_byte_length'],
    ['oversized response', record => { record.eventDateVersions[0].rawResponse.byteLength = 50 * 1024 * 1024 + 1; }, 'invalid_raw_response_byte_length'],
    ['invalid raw digest', record => { record.eventDateVersions[0].rawResponse.sha256 = 'not-a-sha256'; }, 'invalid_raw_response_sha256'],
    ['future capture date', record => { record.eventDateVersions[0].rawResponse.capturedAt = '2026-11-17'; }, 'invalid_raw_response_capture_date']
  ];
  for (const [label, mutate, expectedIssue] of cases) {
    const record = approvedRecord();
    mutate(record);
    const result = auditLegalSourceRegister(registry([record]));
    assert.equal(result.valid, false, label);
    assert.deepEqual(result.structurallyCompleteRecordIds, [], label);
    assert.ok(result.issues.includes('synthetic-check-law:check-law-v1:' + expectedIssue), label);
    assert.deepEqual(result.answerEligibleRecordIds, [], label);
  }
});

test('human review must bind to both the extracted text and the exact raw response digest', () => {
  const record = approvedRecord();
  record.eventDateVersions[0].humanReview.reviewedRawResponseSha256 = 'b'.repeat(64);
  const result = auditLegalSourceRegister(registry([record]));
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes('synthetic-check-law:check-law-v1:review_not_bound_to_exact_raw_response_hash'));
  assert.deepEqual(result.structurallyCompleteRecordIds, []);
  assert.deepEqual(result.answerEligibleRecordIds, []);
});

test('non-Qavanin official document IDs must be in a path segment, not a search query', () => {
  assert.equal(directOfficialDocumentUrl('https://cbi.ir/search?query=35817.aspx', '35817.aspx'), false);
  assert.equal(directOfficialDocumentUrl('https://rrk.ir/search?document=12345', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://cbi.ir/showitem/35817.aspx', '35817.aspx'), true);
  assert.equal(directOfficialDocumentUrl('https://cbi.ir/showitem/35817.aspx?redirect=https%3A%2F%2Fevil.example', '35817.aspx'), false);
  assert.equal(directOfficialDocumentUrl('https://rrk.ir/Document/12345?download=1', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=12345', '12345'), true);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/Law/Attribute/?IDS=12345', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/redirect/?IDS=12345', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/extra?IDS=12345', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/Law/%54reeText/?IDS=12345', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=12345&lang=fa', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=12345&redirect=https%3A%2F%2Fevil.example', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=12345&', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=12345#', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://rrk.ir/Document/12345?', '12345'), false);
  assert.equal(directOfficialDocumentUrl('https://rrk.ir/Document/12345#', '12345'), false);
});

test('non-Qavanin source register URLs reject normalized and encoded path aliases', () => {
  for (const url of [
    'https://rrk.ir/Document/../Document/12345',
    'https://rrk.ir/Document/%2e%2e/Document/12345',
    'https://rrk.ir/Document/%31%32%33%34%35',
    'https://rrk.ir//Document/12345',
    'https://rrk.ir\\\\Document\\\\12345',
    'https://cbi.ir/showitem/../showitem/35817.aspx'
  ]) {
    const id = url.includes('cbi.ir') ? '35817.aspx' : '12345';
    assert.equal(directOfficialDocumentUrl(url, id), false, url);
  }
  assert.equal(directOfficialDocumentUrl('https://rrk.ir/Document/12345', '12345'), true);
});
