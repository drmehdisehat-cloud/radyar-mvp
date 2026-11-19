'use strict';

// Structural guard for the research register. This does not fetch or
// authenticate a portal document and cannot prove that a human reviewer is
// who they claim to be. It only prevents incomplete metadata from being
// promoted to answer-eligible status.
const OFFICIAL_HOSTS = new Set([
  'qavanin.ir', 'dotic.ir', 'rc.majlis.ir', 'rrk.ir', 'www.rrk.ir',
  'cbi.ir', 'www.cbi.ir'
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const PLACEHOLDER_REVIEWER = /^(?:tbd|todo|pending|unknown|n\/a|test|demo|نامشخص|در انتظار بررسی|بازبین فرضی)$/iu;
const UNSAFE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;

function validDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function directOfficialDocumentUrl(value, documentId) {
  if (typeof value !== 'string' || value.length > 2048 || value.includes('#') ||
      typeof documentId !== 'string' || !DOCUMENT_ID.test(documentId) ||
      UNSAFE_CONTROL.test(value) || UNSAFE_CONTROL.test(documentId)) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(host) ||
      (url.port && url.port !== '443') || url.username || url.password ||
      url.pathname === '/' || url.hash) return false;
  if (Array.from(value).some(ch => {
    const code = ch.codePointAt(0);
    return code <= 0x20 || code === 0x7f;
  })) return false;

  const pathSegments = url.pathname.split('/').filter(Boolean).map(segment => {
    try { return decodeURIComponent(segment); } catch { return '\uFFFD'; }
  });
  const queryEntries = Array.from(url.searchParams.entries());
  const queryKeys = queryEntries.map(([key]) => key.toLowerCase());
  if (new Set(queryKeys).size !== queryKeys.length) return false;
  if ([...pathSegments, ...queryEntries.flat()].some(part => UNSAFE_CONTROL.test(part))) return false;
  const pathMatches = pathSegments.filter(part => part === documentId).length;
  const queryMatches = queryEntries.filter(([, part]) => part === documentId).length;
  if (host === 'qavanin.ir') {
    const ids = queryEntries.filter(([key]) => key === 'IDS');
    if (url.pathname !== '/Law/TreeText/' || pathMatches !== 0 || queryMatches !== 1 || queryEntries.length !== 1 ||
        url.search !== '?IDS=' + documentId || ids.length !== 1 || ids[0][1] !== documentId) return false;
  } else if (pathMatches !== 1 || queryEntries.length !== 0 || queryMatches !== 0 || url.search !== '' || value.includes('?')) {
    // Other official portals must identify the document in the path itself.
    // Reject every query parameter: it may select alternate content or redirect behavior.
    return false;
  }
  return true;
}

function validateVersion(version, observedAt, requireHumanReview) {
  const issues = [];
  if (!version || typeof version !== 'object' || Array.isArray(version)) {
    return ['version_not_object'];
  }
  if (typeof version.id !== 'string' || !version.id.trim()) issues.push('version_id_missing');
  if (typeof version.documentId !== 'string' || !directOfficialDocumentUrl(version.officialDocumentUrl, version.documentId)) {
    issues.push('not_a_direct_allowlisted_official_document_url');
  }
  if (typeof version.publicationIssue !== 'string' || !version.publicationIssue.trim()) issues.push('publication_issue_missing');
  if (!validDate(version.publicationDate)) issues.push('invalid_publication_date');
  if (validDate(version.publicationDate) && validDate(version.retrievedAt) && version.publicationDate > version.retrievedAt) {
    issues.push('publication_after_retrieval');
  }
  if (!validDate(version.effectiveFrom)) issues.push('invalid_effective_from');
  if (version.effectiveTo !== null && version.effectiveTo !== undefined &&
      (!validDate(version.effectiveTo) || !validDate(version.effectiveFrom) || version.effectiveTo <= version.effectiveFrom)) {
    issues.push('invalid_effective_to');
  }
  if (!validDate(version.retrievedAt) || (validDate(version.retrievedAt) && version.retrievedAt > observedAt)) {
    issues.push('invalid_retrieved_at');
  }
  if (!SHA256.test(String(version.textSha256 || ''))) issues.push('invalid_text_sha256');

  if (requireHumanReview) {
    const review = version.humanReview;
    if (!review || typeof review !== 'object' || Array.isArray(review)) {
      issues.push('human_review_missing');
    } else {
      const reviewer = typeof review.reviewer === 'string' ? review.reviewer.trim().normalize('NFKC') : '';
      if (reviewer.length < 3 || reviewer.length > 120 || PLACEHOLDER_REVIEWER.test(reviewer) || UNSAFE_CONTROL.test(reviewer)) {
        issues.push('human_reviewer_invalid');
      }
      if (!validDate(review.reviewedAt) || !validDate(observedAt) || review.reviewedAt > observedAt ||
          (validDate(version.retrievedAt) && review.reviewedAt < version.retrievedAt)) {
        issues.push('invalid_reviewed_at');
      }
      if (review.decision !== 'approved') issues.push('human_review_not_approved');
      if (!SHA256.test(String(review.reviewedTextSha256 || '')) || review.reviewedTextSha256 !== version.textSha256) {
        issues.push('review_not_bound_to_exact_text_hash');
      }
    }
  }
  return issues;
}

function auditLegalSourceRegister(register) {
  const issues = [];
  const eligible = [];
  if (!register || typeof register !== 'object' || Array.isArray(register)) {
    return { valid: false, issues: ['register_not_object'], answerEligibleRecordIds: [], structuralOnly: true };
  }
  if (register.schema !== 'dadyar-legal-source-register-v1') issues.push('unsupported_register_schema');
  if (register.policy?.defaultUseInLegalAnswers !== false) issues.push('default_answer_use_must_be_false');
  const observedAt = register.observedAt;
  if (!validDate(observedAt)) issues.push('invalid_register_observed_at');
  if (!Array.isArray(register.records)) issues.push('records_not_array');
  const records = Array.isArray(register.records) ? register.records : [];
  const ids = new Set();

  for (const record of records) {
    const id = typeof record?.id === 'string' && record.id.trim() ? record.id : 'unknown';
    const prefix = id + ':';
    if (ids.has(id)) issues.push(prefix + 'duplicate_record_id');
    ids.add(id);
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      issues.push(prefix + 'record_not_object');
      continue;
    }
    if (typeof record.primarySourceVerified !== 'boolean') issues.push(prefix + 'primary_source_status_missing');
    if (!['pending', 'approved', 'rejected'].includes(record.humanReviewStatus)) issues.push(prefix + 'invalid_human_review_status');
    if (typeof record.useInLegalAnswers !== 'boolean') issues.push(prefix + 'answer_use_flag_missing');

    const claimedVerified = record.primarySourceVerified === true;
    const claimedReviewed = record.humanReviewStatus === 'approved';
    const claimedUse = record.useInLegalAnswers === true;
    if (claimedReviewed && !claimedVerified) issues.push(prefix + 'review_cannot_approve_unverified_primary_source');
    if (claimedUse && (!claimedVerified || !claimedReviewed)) issues.push(prefix + 'answer_use_requires_verified_primary_source_and_approved_review');

    if (!claimedVerified) {
      if (claimedUse) issues.push(prefix + 'unverified_source_cannot_support_answers');
      continue;
    }

    if (!Array.isArray(record.eventDateVersions) || record.eventDateVersions.length === 0) {
      issues.push(prefix + 'event_date_versions_missing');
      continue;
    }
    const versionIds = new Set();
    const validated = [];
    for (const version of record.eventDateVersions) {
      const versionId = typeof version?.id === 'string' ? version.id : 'unknown';
      if (versionIds.has(versionId)) issues.push(prefix + 'duplicate_version_id:' + versionId);
      versionIds.add(versionId);
      const versionIssues = validateVersion(version, observedAt, claimedReviewed);
      for (const issue of versionIssues) issues.push(prefix + versionId + ':' + issue);
      if (versionIssues.length === 0) validated.push(version);
    }
    for (let i = 0; i < validated.length; i++) {
      for (let j = i + 1; j < validated.length; j++) {
        const a = validated[i], b = validated[j];
        const aEnd = a.effectiveTo || '9999-12-31';
        const bEnd = b.effectiveTo || '9999-12-31';
        if (a.effectiveFrom < bEnd && b.effectiveFrom < aEnd) {
          issues.push(prefix + 'overlapping_event_date_versions:' + a.id + ':' + b.id);
        }
      }
    }
    const recordHasIssues = issues.some(issue => issue.startsWith(prefix));
    if (claimedUse && !recordHasIssues && validated.length === record.eventDateVersions.length) eligible.push(id);
    if (claimedUse && recordHasIssues) issues.push(prefix + 'incomplete_evidence_cannot_be_used_in_answers');
  }

  const valid = issues.length === 0;
  return {
    valid,
    issues,
    // Never expose a promotable record when any register-level or record-level
    // validation issue exists. Consumers must still require valid === true.
    answerEligibleRecordIds: valid ? eligible : [],
    structuralOnly: true
  };
}

module.exports = { validDate, directOfficialDocumentUrl, auditLegalSourceRegister };
