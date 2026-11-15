'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeOfficialDocumentUrl } = require('../backend/legal-source-versioning.cjs');

test('Qavanin document URL rejects duplicate IDS parameters even when the first value matches', () => {
  assert.equal(
    safeOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=1001&IDS=9999', '1001'),
    false
  );
});

test('Qavanin document URL rejects duplicate IDS parameters when the matching value is second', () => {
  assert.equal(
    safeOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=9999&IDS=1001', '1001'),
    false
  );
});

test('Qavanin document URL rejects case-variant duplicate IDS parameters', () => {
  assert.equal(
    safeOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=1001&ids=9999', '1001'),
    false
  );
});

test('official document URL rejects duplicate unrelated query keys instead of choosing parser-dependent values', () => {
  assert.equal(
    safeOfficialDocumentUrl('https://rrk.ir/notice/?document=1001&document=9999', '1001'),
    false
  );
});

test('official document URL rejects a document identifier repeated in both path and query', () => {
  assert.equal(
    safeOfficialDocumentUrl('https://rrk.ir/notice/1001?document=1001', '1001'),
    false
  );
});

test('rejects document identifiers that contain encoded path or query delimiters', () => {
  const ambiguous = [
    ['https://rrk.ir/notice/1001%2F2', '1001/2'],
    ['https://rrk.ir/notice/1001%5C2', '1001\\2'],
    ['https://rrk.ir/notice/?document=1001%26x%3D2', '1001&x=2'],
    ['https://qavanin.ir/Law/TreeText/?IDS=1001%252F2', '1001%2F2']
  ];
  for (const [url, documentId] of ambiguous) {
    assert.equal(safeOfficialDocumentUrl(url, documentId), false, documentId);
  }
});

test('accepts a bounded opaque ASCII document token without URL delimiters', () => {
  assert.equal(
    safeOfficialDocumentUrl('https://rrk.ir/notice/ABC-123.4_5', 'ABC-123.4_5'),
    true
  );
});

test('official document URL accepts one exact document identifier and unambiguous query keys', () => {
  assert.equal(
    safeOfficialDocumentUrl('https://qavanin.ir/Law/TreeText/?IDS=1001&lang=fa', '1001'),
    true
  );
  assert.equal(
    safeOfficialDocumentUrl('https://rrk.ir/notice/1001?lang=fa', '1001'),
    true
  );
});
