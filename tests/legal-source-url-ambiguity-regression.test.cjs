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
