'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateSourceVersion,
  resolveLegalVersion,
  auditVersionRegistry
} = require('../backend/legal-source-versioning.cjs');

const AS_OF = '2026-11-12';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function verified(overrides = {}) {
  const textSha256 = overrides.textSha256 || HASH_A;
  return {
    id: 'cheque-v1',
    topic: 'instruments',
    instrumentId: 'synthetic-statute-01',
    instrumentType: 'law',
    title: 'قانون فرضی برای آزمون نسخه‌بندی',
    documentId: 'SYNTH-001',
    officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=1001',
    status: 'verified',
    publicationDate: '2024-01-10',
    effectiveFrom: '2024-02-01',
    effectiveTo: null,
    retrievedAt: '2026-11-10',
    textSha256,
    releaseSourceEligible: true,
    humanReview: {
      reviewer: 'بازبین حقوقی آزمایشی',
      reviewedAt: '2026-11-11',
      decision: 'approved',
      reviewedTextSha256: textSha256
    },
    ...overrides
  };
}

function resolve(records, eventDate, asOfDate = AS_OF) {
  return resolveLegalVersion(records, {
    topic: 'instruments',
    instrumentId: 'synthetic-statute-01',
    instrumentType: 'law',
    eventDate,
    asOfDate
  });
}

test('selects the single reviewed version that was effective on the event date', () => {
  const result = resolve([verified()], '2025-05-10');
  assert.equal(result.status, 'verified_version_selected');
  assert.equal(result.source.effectiveFrom, '2024-02-01');
  assert.equal(result.sourceSelectionOnly, true);
  assert.equal(result.legalConclusionPermitted, false);
});

test('uses the new version exactly at an amendment effective-date boundary', () => {
  const oldVersion = verified({
    id: 'cheque-v1',
    effectiveFrom: '2020-01-01',
    effectiveTo: '2024-07-01',
    publicationDate: '2019-12-01',
    retrievedAt: '2026-11-10',
    humanReview: {
      reviewer: 'بازبین حقوقی اول',
      reviewedAt: '2026-11-11',
      decision: 'approved',
      reviewedTextSha256: HASH_A
    }
  });
  const newVersion = verified({
    id: 'cheque-v2',
    effectiveFrom: '2024-07-01',
    effectiveTo: null,
    publicationDate: '2024-06-15',
    textSha256: HASH_B,
    officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=1002',
    humanReview: {
      reviewer: 'بازبین حقوقی دوم',
      reviewedAt: '2026-11-11',
      decision: 'approved',
      reviewedTextSha256: HASH_B
    }
  });
  assert.equal(resolve([oldVersion, newVersion], '2024-06-30').source.id, 'cheque-v1');
  assert.equal(resolve([oldVersion, newVersion], '2024-07-01').source.id, 'cheque-v2');
});

test('does not select research-only records even when an official-looking URL exists', () => {
  const candidate = verified({
    status: 'research-only',
    releaseSourceEligible: false,
    effectiveFrom: null,
    effectiveTo: null,
    publicationDate: null,
    textSha256: null,
    humanReview: null
  });
  const result = resolve([candidate], '2025-05-10');
  assert.equal(result.status, 'source_unavailable');
  assert.equal(result.legalConclusionPermitted, false);
  assert.ok(result.rejected.some(item => item.reasons.includes('research_only')));
});

test('rejects a review bound to a different text hash', () => {
  const result = resolve([verified({
    humanReview: {
      reviewer: 'بازبین حقوقی آزمایشی',
      reviewedAt: '2026-11-11',
      decision: 'approved',
      reviewedTextSha256: HASH_B
    }
  })], '2025-05-10');
  assert.equal(result.status, 'source_unavailable');
  assert.ok(result.rejected.some(item => item.reasons.includes('reviewed_text_hash_mismatch')));
});

test('rejects future retrieval and review observations relative to the requested as-of date', () => {
  const result = resolve([verified({
    retrievedAt: '2026-11-13',
    humanReview: {
      reviewer: 'بازبین حقوقی آزمایشی',
      reviewedAt: '2026-11-13',
      decision: 'approved',
      reviewedTextSha256: HASH_A
    }
  })], '2025-05-10', '2026-11-12');
  assert.equal(result.status, 'source_unavailable');
  assert.ok(result.rejected[0].reasons.includes('future_retrievedAt'));
  assert.ok(result.rejected[0].reasons.includes('future_reviewed_at'));
});

test('rejects non-official hosts and portal homepages as direct citations', () => {
  const unofficial = verified({ officialDocumentUrl: 'https://example.com/law/1001' });
  const homepage = verified({ officialDocumentUrl: 'https://qavanin.ir/' });
  assert.equal(validateSourceVersion(unofficial, AS_OF).eligible, false);
  assert.equal(validateSourceVersion(homepage, AS_OF).eligible, false);
});

test('fails closed when two verified versions overlap on the same event date', () => {
  const first = verified({ id: 'v1', effectiveFrom: '2020-01-01', effectiveTo: null });
  const second = verified({ id: 'v2', effectiveFrom: '2024-01-01', effectiveTo: null });
  const result = resolve([first, second], '2025-05-10');
  assert.equal(result.status, 'ambiguous_version');
  assert.equal(result.legalConclusionPermitted, false);
  assert.equal(auditVersionRegistry([first, second], AS_OF).valid, false);
});

test('registry audit rejects duplicate version identifiers', () => {
  const first = verified({ id: 'duplicate' });
  const second = verified({ id: 'duplicate', officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=1002' });
  const audit = auditVersionRegistry([first, second], AS_OF);
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.includes('duplicate_id:duplicate'));
});

test('rejects invalid calendar dates and invalid as-of requests', () => {
  const invalid = verified({ effectiveFrom: '2024-02-30' });
  assert.equal(validateSourceVersion(invalid, AS_OF).eligible, false);
  assert.equal(resolve([verified()], '2024-02-30').status, 'invalid_request');
});

test('a rejected human review cannot make a source eligible', () => {
  const result = resolve([verified({
    humanReview: {
      reviewer: 'بازبین حقوقی آزمایشی',
      reviewedAt: '2026-11-11',
      decision: 'rejected',
      reviewedTextSha256: HASH_A
    }
  })], '2025-05-10');
  assert.equal(result.status, 'source_unavailable');
  assert.ok(result.rejected[0].reasons.includes('human_review_not_approved'));
});

test('returns source_unavailable instead of inventing a version when no record exists', () => {
  const result = resolve([], '2025-05-10');
  assert.equal(result.status, 'source_unavailable');
  assert.equal(result.reason, 'no_registry_record');
});
