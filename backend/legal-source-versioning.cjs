'use strict';

// Fail-closed, date-aware selector for official legal-source versions.
// This module selects provenance metadata only. It does not interpret law,
// authenticate a portal response, or authorize a legal conclusion.
const OFFICIAL_HOSTS = new Set([
  'qavanin.ir',
  'dotic.ir',
  'rc.majlis.ir',
  'rrk.ir',
  'www.rrk.ir'
]);
const SHA256 = /^[a-f0-9]{64}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLACEHOLDER = /^(?:tbd|todo|pending|unknown|n\/a|test|demo|نامشخص|در انتظار بررسی|بازبین فرضی)$/iu;

function validDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function safeOfficialDocumentUrl(value, documentId) {
  if (typeof value !== 'string' || value.length > 2048 ||
      typeof documentId !== 'string' || !documentId.trim() || documentId.length > 120) {
    return false;
  }
  let url;
  try { url = new URL(value); } catch { return false; }
  const resource = url.pathname + url.search;
  const documentIdMatches = resource.includes(documentId) ||
    resource.includes(encodeURIComponent(documentId));
  const qavaninIdMatches = url.hostname.toLowerCase() !== 'qavanin.ir' ||
    url.searchParams.get('IDS') === documentId;
  return url.protocol === 'https:' &&
    OFFICIAL_HOSTS.has(url.hostname.toLowerCase()) &&
    (!url.port || url.port === '443') &&
    !url.username && !url.password &&
    url.pathname !== '/' &&
    !url.hash &&
    documentIdMatches &&
    qavaninIdMatches &&
    !Array.from(value).some(character => {
      const code = character.codePointAt(0);
      return code <= 0x20 || code === 0x7f;
    });
}

function validateSourceVersion(record, asOfDate) {
  const issues = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, eligible: false, issues: ['record_not_object'] };
  }
  for (const key of ['id', 'topic', 'instrumentId', 'title', 'documentId', 'officialDocumentUrl']) {
    if (typeof record[key] !== 'string' || !record[key].trim() || record[key].length > 2048) {
      issues.push('invalid_' + key);
    }
  }
  if (!['law', 'ruling'].includes(record.instrumentType)) issues.push('invalid_instrument_type');
  if (!['research-only', 'verified'].includes(record.status)) issues.push('invalid_status');
  if (!safeOfficialDocumentUrl(record.officialDocumentUrl, record.documentId)) {
    issues.push('not_a_direct_allowlisted_official_document_url');
  }
  if (!validDate(asOfDate)) issues.push('invalid_as_of_date');

  if (record.status === 'research-only') {
    if (record.releaseSourceEligible === true) issues.push('research_only_cannot_be_release_eligible');
    return { ok: issues.length === 0, eligible: false, issues: [...issues, 'research_only'] };
  }

  for (const key of ['publicationDate', 'effectiveFrom', 'retrievedAt']) {
    if (!validDate(record[key])) issues.push('invalid_' + key);
    else if (validDate(asOfDate) && record[key] > asOfDate) issues.push('future_' + key);
  }
  if (record.effectiveTo !== null &&
      (!validDate(record.effectiveTo) || (validDate(record.effectiveFrom) && record.effectiveTo <= record.effectiveFrom))) {
    issues.push('invalid_effective_to');
  }
  if (typeof record.textSha256 !== 'string' || !SHA256.test(record.textSha256)) {
    issues.push('invalid_text_sha256');
  }
  if (record.releaseSourceEligible !== true) issues.push('release_source_not_eligible');

  const review = record.humanReview;
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    issues.push('human_review_missing');
  } else {
    if (typeof review.reviewer !== 'string' || review.reviewer.trim().length < 3 ||
        review.reviewer.length > 120 || PLACEHOLDER.test(review.reviewer.trim().normalize('NFKC')) ||
        /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e-\u202e\u2060-\u206f\ufeff]/u.test(review.reviewer)) {
      issues.push('human_reviewer_invalid');
    }
    if (review.decision !== 'approved') issues.push('human_review_not_approved');
    if (!validDate(review.reviewedAt)) issues.push('invalid_reviewed_at');
    else if (validDate(asOfDate) && review.reviewedAt > asOfDate) issues.push('future_reviewed_at');
    if (!SHA256.test(String(review.reviewedTextSha256 || '')) ||
        !SHA256.test(String(record.textSha256 || '')) ||
        String(review.reviewedTextSha256).toLowerCase() !== String(record.textSha256).toLowerCase()) {
      issues.push('reviewed_text_hash_mismatch');
    }
  }
  return { ok: issues.length === 0, eligible: issues.length === 0, issues };
}

function coversEventDate(record, eventDate) {
  return record.effectiveFrom <= eventDate &&
    (record.effectiveTo === null || eventDate < record.effectiveTo);
}

function resolveLegalVersion(records, options = {}) {
  const { topic, instrumentId, instrumentType, eventDate, asOfDate } = options;
  if (!Array.isArray(records) || !topic || !instrumentId ||
      !['law', 'ruling'].includes(instrumentType) ||
      !validDate(eventDate) || !validDate(asOfDate)) {
    return { status: 'invalid_request', legalConclusionPermitted: false };
  }
  const candidates = records.filter(record =>
    record && record.topic === topic &&
    record.instrumentId === instrumentId &&
    record.instrumentType === instrumentType
  );
  if (!candidates.length) {
    return { status: 'source_unavailable', reason: 'no_registry_record', legalConclusionPermitted: false };
  }

  const eligible = [];
  const rejected = [];
  for (const record of candidates) {
    const validation = validateSourceVersion(record, asOfDate);
    if (!validation.eligible) {
      rejected.push({ id: String(record.id || '').slice(0, 120), reasons: validation.issues });
      continue;
    }
    if (!coversEventDate(record, eventDate)) {
      rejected.push({ id: record.id, reasons: ['version_does_not_cover_event_date'] });
      continue;
    }
    eligible.push(record);
  }
  if (eligible.length > 1) {
    return {
      status: 'ambiguous_version',
      reason: 'multiple_verified_versions_cover_event_date',
      candidateIds: eligible.map(record => record.id),
      legalConclusionPermitted: false
    };
  }
  if (eligible.length === 0) {
    return {
      status: 'source_unavailable',
      reason: 'no_verified_version_for_event_date',
      rejected,
      legalConclusionPermitted: false
    };
  }
  const selected = eligible[0];
  return {
    status: 'verified_version_selected',
    sourceSelectionOnly: true,
    legalConclusionPermitted: false,
    source: {
      id: selected.id,
      topic: selected.topic,
      instrumentId: selected.instrumentId,
      instrumentType: selected.instrumentType,
      title: selected.title,
      officialDocumentUrl: selected.officialDocumentUrl,
      documentId: selected.documentId,
      publicationDate: selected.publicationDate,
      effectiveFrom: selected.effectiveFrom,
      effectiveTo: selected.effectiveTo,
      retrievedAt: selected.retrievedAt,
      textSha256: selected.textSha256,
      reviewer: selected.humanReview.reviewer,
      reviewedAt: selected.humanReview.reviewedAt
    }
  };
}

function auditVersionRegistry(records, asOfDate) {
  const issues = [];
  if (!Array.isArray(records)) return { valid: false, issues: ['registry_not_array'] };
  if (!validDate(asOfDate)) return { valid: false, issues: ['invalid_as_of_date'] };
  const ids = new Set();
  const verified = [];
  for (const record of records) {
    const validation = validateSourceVersion(record, asOfDate);
    if (record && typeof record.id === 'string') {
      if (ids.has(record.id)) issues.push('duplicate_id:' + record.id);
      ids.add(record.id);
    }
    if (!validation.ok) issues.push(...validation.issues.map(issue => String(record?.id || 'unknown') + ':' + issue));
    if (validation.eligible) verified.push(record);
  }
  for (let i = 0; i < verified.length; i++) {
    for (let j = i + 1; j < verified.length; j++) {
      const a = verified[i], b = verified[j];
      if (a.topic !== b.topic || a.instrumentId !== b.instrumentId || a.instrumentType !== b.instrumentType) continue;
      const aEnd = a.effectiveTo || '9999-12-31';
      const bEnd = b.effectiveTo || '9999-12-31';
      if (a.effectiveFrom < bEnd && b.effectiveFrom < aEnd) {
        issues.push('overlapping_verified_versions:' + a.id + ':' + b.id);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

module.exports = {
  OFFICIAL_HOSTS,
  validDate,
  safeOfficialDocumentUrl,
  validateSourceVersion,
  resolveLegalVersion,
  auditVersionRegistry
};
