'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  persianToGregorian,
  resolvePersianLegalVersion
} = require('../backend/persian-legal-date-versioning.cjs');

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const AS_OF = '2026-11-24';

function verified(overrides = {}) {
  const textSha256 = overrides.textSha256 || HASH_A;
  return {
    id: 'cheque-v1',
    topic: 'instruments',
    instrumentId: 'synthetic-statute-01',
    instrumentType: 'law',
    title: 'قانون فرضی برای آزمون تقویم',
    documentId: '1001',
    officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=1001',
    status: 'verified',
    legalDateCalendar: 'jalali',
    publicationDate: '1399-11-10',
    effectiveFrom: '1400-01-01',
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

function resolve(records, eventDate, eventDateCalendar = 'jalali', asOfDate = AS_OF) {
  return resolvePersianLegalVersion(records, {
    topic: 'instruments',
    instrumentId: 'synthetic-statute-01',
    instrumentType: 'law',
    eventDate,
    eventDateCalendar,
    asOfDate,
    asOfDateCalendar: 'gregorian'
  });
}

test('converts known Jalali anchors to Gregorian UTC dates', () => {
  assert.equal(persianToGregorian('1400-01-01'), '2021-03-21');
  assert.equal(persianToGregorian('۱۴۰۳-۰۱-۰۱'), '2024-03-20');
  assert.equal(persianToGregorian('١٤٠٥-٠١-٠١'), '2026-03-21');
});

test('rejects invalid Jalali calendar dates, including a non-leap Esfand 30', () => {
  assert.equal(persianToGregorian('1400-12-30'), null);
  assert.equal(persianToGregorian('1403-13-01'), null);
  assert.equal(persianToGregorian('1403-00-10'), null);
  assert.equal(persianToGregorian('1403/01/01'), null);
});

test('selects a reviewed Jalali legal version and preserves original and normalized dates', () => {
  const result = resolve([verified()], '۱۴۰۰-۰۲-۰۱');
  assert.equal(result.status, 'verified_version_selected');
  assert.equal(result.legalConclusionPermitted, false);
  assert.equal(result.source.legalDateCalendar, 'jalali');
  assert.equal(result.source.eventDate, '1400-02-01');
  assert.equal(result.source.eventDateCalendar, 'jalali');
  assert.equal(result.source.originalLegalDates.effectiveFrom, '1400-01-01');
  assert.equal(result.source.normalizedGregorianDates.effectiveFrom, '2021-03-21');
  assert.equal(result.source.normalizedGregorianDates.eventDate, '2021-04-21');
});

test('uses the new Jalali version exactly on the amendment effective-date boundary', () => {
  const oldVersion = verified({
    id: 'cheque-v1',
    effectiveFrom: '1400-01-01',
    effectiveTo: '1403-07-01'
  });
  const newVersion = verified({
    id: 'cheque-v2',
    effectiveFrom: '1403-07-01',
    effectiveTo: null,
    publicationDate: '1403-06-15',
    documentId: '1002',
    officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=1002',
    textSha256: HASH_B,
    humanReview: {
      reviewer: 'بازبین حقوقی دوم',
      reviewedAt: '2026-11-11',
      decision: 'approved',
      reviewedTextSha256: HASH_B
    }
  });
  assert.equal(resolve([oldVersion, newVersion], '1403-06-31').source.id, 'cheque-v1');
  assert.equal(resolve([oldVersion, newVersion], '1403-07-01').source.id, 'cheque-v2');
});

test('requires an explicit event-date calendar and rejects invalid Jalali event dates', () => {
  assert.equal(resolvePersianLegalVersion([verified()], {
    topic: 'instruments', instrumentId: 'synthetic-statute-01', instrumentType: 'law',
    eventDate: '1400-02-01', asOfDate: AS_OF, asOfDateCalendar: 'gregorian'
  }).reason, 'invalid_event_date_or_calendar');
  assert.equal(resolve([verified()], '1400-12-30').reason, 'invalid_event_date_or_calendar');
});

test('requires an explicit legal-date calendar for verified records', () => {
  const record = verified();
  delete record.legalDateCalendar;
  const result = resolve([record], '1400-02-01');
  assert.equal(result.status, 'source_unavailable');
  assert.ok(result.rejected.some(item => item.reasons.includes('legal_date_calendar_missing_or_invalid')));
});

test('compares Jalali publication date with Gregorian retrieval time after normalization', () => {
  const record = verified({ publicationDate: '1405-01-01', retrievedAt: '2026-01-01' });
  const result = resolve([record], '1405-02-01');
  assert.equal(result.status, 'source_unavailable');
  assert.ok(result.rejected.some(item => item.reasons.includes('publication_after_retrieval')));
});

test('refuses a Jalali event date that is in the future relative to the Gregorian as-of date', () => {
  const result = resolve([verified()], '1406-01-01');
  assert.equal(result.status, 'invalid_request');
  assert.equal(result.reason, 'event_date_after_as_of_date');
  assert.equal(result.legalConclusionPermitted, false);
});

test('accepts explicitly Gregorian version metadata without treating it as Jalali', () => {
  const record = verified({
    legalDateCalendar: 'gregorian',
    publicationDate: '2020-01-10',
    effectiveFrom: '2020-02-01',
    effectiveTo: null
  });
  const result = resolve([record], '2020-03-01', 'gregorian');
  assert.equal(result.status, 'verified_version_selected');
  assert.equal(result.source.normalizedGregorianDates.effectiveFrom, '2020-02-01');
});

test('does not invoke accessors while inspecting legal date calendar metadata', () => {
  let invoked = false;
  const record = verified();
  Object.defineProperty(record, 'legalDateCalendar', {
    enumerable: true,
    get() { invoked = true; return 'jalali'; }
  });
  const result = resolve([record], '1400-02-01');
  assert.equal(invoked, false);
  assert.equal(result.status, 'source_unavailable');
});


test('requires the system as-of date calendar to be explicitly Gregorian', () => {
  const result = resolvePersianLegalVersion([verified()], {
    topic: 'instruments', instrumentId: 'synthetic-statute-01', instrumentType: 'law',
    eventDate: '1400-02-01', eventDateCalendar: 'jalali', asOfDate: AS_OF
  });
  assert.equal(result.status, 'invalid_request');
  assert.equal(result.reason, 'invalid_gregorian_as_of_date');
});

test('rejects duplicate verified source IDs instead of mapping normalized dates ambiguously', () => {
  const first = verified({ id: 'duplicate-version-id', effectiveFrom: '1400-01-01', effectiveTo: '1403-07-01' });
  const second = verified({ id: 'duplicate-version-id', effectiveFrom: '1403-07-01', effectiveTo: null, documentId: '1002', officialDocumentUrl: 'https://qavanin.ir/Law/TreeText/?IDS=1002', textSha256: HASH_B, humanReview: { reviewer: 'بازبین دوم', reviewedAt: '2026-11-11', decision: 'approved', reviewedTextSha256: HASH_B } });
  const result = resolve([first, second], '1403-07-01');
  assert.equal(result.status, 'source_unavailable');
  assert.ok(result.rejected.filter(item => item.reasons.includes('duplicate_verified_record_id')).length === 2);
});

test('does not invoke accessors on the request options object', () => {
  let invoked = false;
  const options = {
    topic: 'instruments',
    instrumentId: 'synthetic-statute-01',
    instrumentType: 'law',
    eventDate: '1400-02-01',
    eventDateCalendar: 'jalali',
    asOfDate: AS_OF
  };
  Object.defineProperty(options, 'eventDateCalendar', { enumerable: true, get() { invoked = true; return 'jalali'; } });
  const result = resolvePersianLegalVersion([verified()], options);
  assert.equal(invoked, false);
  assert.equal(result.status, 'invalid_request');
  assert.equal(result.reason, 'invalid_options_object');
});
