'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSourceVersion } = require('../backend/legal-source-versioning.cjs');

const AS_OF = '2026-11-15';
const HASH = 'a'.repeat(64);

function record(overrides = {}) {
  return {
    id: 'source-v1',
    topic: 'instruments',
    instrumentId: 'synthetic-statute-01',
    instrumentType: 'law',
    title: 'قانون فرضی چک',
    documentId: '1001',
    officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=1001',
    status: 'verified',
    publicationDate: '2024-01-10',
    effectiveFrom: '2024-02-01',
    effectiveTo: null,
    retrievedAt: '2026-11-10',
    textSha256: HASH,
    releaseSourceEligible: true,
    humanReview: {
      reviewer: 'بازبین حقوقی نمونه',
      reviewedAt: '2026-11-11',
      decision: 'approved',
      reviewedTextSha256: HASH
    },
    ...overrides
  };
}

test('rejects invisible and bidirectional controls in legal-source identity and display fields', () => {
  const cases = [
    ['id', 'source-\u2066v1'],
    ['topic', 'instrument\u200b'],
    ['instrumentId', 'statute-\u202e01'],
    ['title', 'قانون\u202eچک'],
    ['documentId', '100\u061c1']
  ];
  for (const [field, value] of cases) {
    const result = validateSourceVersion(record({ [field]: value }), AS_OF);
    assert.equal(result.eligible, false, field + ' must be rejected');
    assert.ok(result.issues.includes('unsafe_' + field), field + ' should report unsafe metadata');
  }
});

test('rejects percent-encoded bidi controls after decoding official URL components', () => {
  const result = validateSourceVersion(record({
    officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=1001&caption=%E2%80%AE'
  }), AS_OF);
  assert.equal(result.eligible, false);
  assert.ok(result.issues.includes('not_a_direct_allowlisted_official_document_url'));
});

test('preserves Persian ZWNJ in a valid source title', () => {
  const result = validateSourceVersion(record({ title: 'قانون چک\u200cنمونه' }), AS_OF);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.issues, []);
});
