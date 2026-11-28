'use strict';

// Explicit calendar adapter for Iranian legal-event dates. The existing
// legal-source resolver is Gregorian-only; this adapter converts Jalali civil
// dates to Gregorian UTC dates before delegating to that fail-closed resolver.
// It selects provenance metadata only and never authorizes a legal conclusion.

const {
  validDate: validGregorianDate,
  resolveLegalVersion
} = require('./legal-source-versioning.cjs');

const DAY_MS = 86400000;
const PERSIAN_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric'
});
const PERSIAN_CALENDAR_AVAILABLE = PERSIAN_FORMATTER.resolvedOptions().calendar === 'persian';

function normalizeDigits(value) {
  return String(value).normalize('NFKC')
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660));
}

function parseCivilDate(value) {
  if (typeof value !== 'string') return null;
  const normalized = normalizeDigits(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 1 || year > 9999 ||
      month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function persianParts(epochDay) {
  const date = new Date(epochDay * DAY_MS);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.create(null);
  for (const part of PERSIAN_FORMATTER.formatToParts(date)) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      parts[part.type] = Number(part.value);
    }
  }
  if (![parts.year, parts.month, parts.day].every(Number.isInteger)) return null;
  return { year: parts.year, month: parts.month, day: parts.day };
}

function compareDateParts(left, right) {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

function persianToGregorian(value) {
  if (!PERSIAN_CALENDAR_AVAILABLE) return null;
  const target = parseCivilDate(value);
  if (!target) return null;

  // A Jalali year starts around March 20/21 of Gregorian year + 621.
  // The wider three-year search interval avoids assumptions about leap years.
  const firstDay = Math.floor(Date.UTC(target.year + 620, 0, 1) / DAY_MS);
  const lastDay = Math.floor(Date.UTC(target.year + 623, 0, 1) / DAY_MS);
  let low = firstDay;
  let high = lastDay;

  // Find the first Gregorian UTC day whose ICU Persian-calendar tuple is not
  // earlier than the requested Jalali date, then require an exact match.
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const parts = persianParts(middle);
    if (!parts) return null;
    if (compareDateParts(parts, target) < 0) low = middle + 1;
    else high = middle - 1;
  }

  const resolved = persianParts(low);
  if (!resolved || compareDateParts(resolved, target) !== 0) return null;
  return new Date(low * DAY_MS).toISOString().slice(0, 10);
}

function normalizeCalendarDate(value, calendar) {
  if (calendar === 'gregorian') return validGregorianDate(value) ? value : null;
  if (calendar === 'jalali') return persianToGregorian(value);
  return null;
}

function snapshotPlainRecord(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) return null;
    const snapshot = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          !descriptor.enumerable) return null;
      Object.defineProperty(snapshot, key, {
        value: descriptor.value,
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return snapshot;
  } catch {
    return null;
  }
}

function resolvePersianLegalVersion(records, options = {}) {
  if (!Array.isArray(records)) {
    return { status: 'invalid_request', reason: 'registry_not_array', legalConclusionPermitted: false };
  }
  const request = snapshotPlainRecord(options);
  if (!request) {
    return { status: 'invalid_request', reason: 'invalid_options_object', legalConclusionPermitted: false };
  }
  const { eventDate, eventDateCalendar, asOfDate, asOfDateCalendar } = request;
  if (asOfDateCalendar !== 'gregorian' || !validGregorianDate(asOfDate)) {
    return { status: 'invalid_request', reason: 'invalid_gregorian_as_of_date', legalConclusionPermitted: false };
  }
  const normalizedEventDate = normalizeCalendarDate(eventDate, eventDateCalendar);
  if (!normalizedEventDate) {
    return { status: 'invalid_request', reason: 'invalid_event_date_or_calendar', legalConclusionPermitted: false };
  }

  const snapshots = records.map(snapshotPlainRecord);
  const idCounts = new Map();
  for (const record of snapshots) {
    if (record && record.topic === request.topic && record.instrumentId === request.instrumentId &&
        record.instrumentType === request.instrumentType && record.status === 'verified' &&
        typeof record.id === 'string') {
      idCounts.set(record.id, (idCounts.get(record.id) || 0) + 1);
    }
  }
  const originalRecords = new Map();
  const calendarRejected = [];
  const normalizedRecords = records.map((rawRecord, index) => {
    const record = snapshots[index];
    if (!record) return rawRecord;
    if (record.topic !== request.topic || record.instrumentId !== request.instrumentId ||
        record.instrumentType !== request.instrumentType || record.status !== 'verified') return record;

    const recordId = String(record.id || '').slice(0, 120);
    if (typeof record.id === 'string' && idCounts.get(record.id) > 1) {
      calendarRejected.push({ id: recordId, reasons: ['duplicate_verified_record_id'] });
      record.status = 'research-only';
      record.releaseSourceEligible = false;
      return record;
    }

    const calendar = record.legalDateCalendar;
    if (!['jalali', 'gregorian'].includes(calendar)) {
      calendarRejected.push({ id: recordId, reasons: ['legal_date_calendar_missing_or_invalid'] });
      record.status = 'research-only';
      record.releaseSourceEligible = false;
      return record;
    }

    const normalized = Object.create(null);
    for (const [key, value] of Object.entries(record)) normalized[key] = value;
    for (const field of ['publicationDate', 'effectiveFrom', 'effectiveTo']) {
      if (field === 'effectiveTo' && record[field] === null) continue;
      const converted = normalizeCalendarDate(record[field], calendar);
      if (!converted) {
        calendarRejected.push({ id: recordId, reasons: ['invalid_' + calendar + '_' + field] });
        record.status = 'research-only';
        record.releaseSourceEligible = false;
        return record;
      }
      normalized[field] = converted;
    }
    originalRecords.set(String(record.id || ''), record);
    return normalized;
  });

  const result = resolveLegalVersion(normalizedRecords, {
    ...request,
    eventDate: normalizedEventDate,
    asOfDate
  });

  if (calendarRejected.length) {
    if (Array.isArray(result.rejected)) result.rejected.push(...calendarRejected);
    else result.rejected = calendarRejected;
  }

  if (result.status === 'verified_version_selected' && result.source) {
    const original = originalRecords.get(String(result.source.id));
    if (original) {
      result.source.legalDateCalendar = original.legalDateCalendar;
      const parsedEventDate = parseCivilDate(eventDate);
      result.source.eventDate = parsedEventDate
        ? String(parsedEventDate.year).padStart(4, '0') + '-' + String(parsedEventDate.month).padStart(2, '0') + '-' + String(parsedEventDate.day).padStart(2, '0')
        : '';
      result.source.eventDateCalendar = eventDateCalendar;
      result.source.originalLegalDates = {
        publicationDate: original.publicationDate,
        effectiveFrom: original.effectiveFrom,
        effectiveTo: original.effectiveTo,
        calendar: original.legalDateCalendar
      };
      result.source.normalizedGregorianDates = {
        eventDate: normalizedEventDate,
        publicationDate: result.source.publicationDate,
        effectiveFrom: result.source.effectiveFrom,
        effectiveTo: result.source.effectiveTo
      };
    }
  }
  return result;
}

module.exports = {
  persianToGregorian,
  normalizeCalendarDate,
  resolvePersianLegalVersion
};
