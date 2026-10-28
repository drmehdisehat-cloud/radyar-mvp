#!/usr/bin/env node
'use strict';
// Read-only evidence inventory, not a legal opinion or publication approval.
const fs = require('node:fs');
const path = require('node:path');

function audit(matrix) {
  if (!matrix || matrix.topic !== 'check' || !Array.isArray(matrix.amendments) ||
      matrix.amendments.length === 0 || matrix.amendments.some(item => !item || typeof item !== 'object')) {
    return { status: 'INVALID_EVIDENCE', topic: 'check', instruments: [], errors: ['invalid_matrix'] };
  }
  const instruments = matrix.amendments.map(item => {
    const gaps = [];
    const candidate = item.candidateInstrument;
    // A boolean claiming that primary text was retrieved is not evidence by
    // itself. Require a dated observation linked to the same direct official
    // document. This still does NOT verify the gazette or legal effect.
    const observation = candidate && candidate.primaryTextObservation;
    const primaryUrl = candidate && candidate.candidatePrimaryDocumentUrl;
    const observationDate = observation && observation.observedAt;
    const observedDateValid = typeof observationDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(observationDate) &&
      !Number.isNaN(Date.parse(observationDate)) &&
      new Date(observationDate).toISOString().slice(0, 10) === observationDate &&
      observationDate <= new Date().toISOString().slice(0, 10);
    const candidatePrimaryEvidence = candidate && candidate.candidatePrimaryTextRetrieved === true &&
      typeof primaryUrl === 'string' &&
      /^https:\/\/qavanin\.ir\/Law\/TreeText\/\?IDS=[1-9]\d*$/i.test(primaryUrl) &&
      observation && observation.url === primaryUrl &&
      observation.sourceType === 'official-qavanin-portal-consolidated-text' &&
      observedDateValid;
    if (item.independentPrimaryAmendmentTextVerified !== true && !candidatePrimaryEvidence) {
      gaps.push('independent_primary_instrument');
    }
    const lead = candidate && candidate.publicationResearchLead;
    // Missing research leads never count as proof of publication or commencement.
    // Positive flags are necessary but do not replace independent legal review.
    if (!item.officialGazetteNumber || !item.officialGazettePublicationDate ||
        (candidate && (!lead || lead.primaryGazetteIssueRetrieved !== true))) {
      gaps.push('primary_official_gazette');
    }
    if (!item.effectiveDate ||
        (candidate && (!lead || lead.effectiveDateIndependentlyVerified !== true))) {
      gaps.push('verified_effective_date');
    }
    if (item.transitionalApplicabilityVerified !== true) gaps.push('transitional_applicability');
    if (candidate && (!candidate.primaryTextObservation ||
        candidate.primaryTextObservation.subsequentAmendmentsChecked !== true)) {
      gaps.push('subsequent_amendments');
    }
    // A populated field is not a sign-off: reject empty, placeholder, and
    // malformed metadata. Even valid-looking values still require independent
    // reviewer identity verification outside this research inventory.
    const reviewer = typeof item.humanReviewer === 'string'
      ? item.humanReviewer.trim().normalize('NFKC') : '';
    const reviewerPlaceholder = /^(?:tbd|todo|pending|unknown|n\/a|test|demo|نامشخص|در انتظار بررسی|بازبین فرضی)$/iu;
    const reviewedAt = item.humanReviewedAt;
    const reviewDateValid = typeof reviewedAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(reviewedAt) &&
      !Number.isNaN(Date.parse(reviewedAt)) &&
      new Date(reviewedAt).toISOString().slice(0, 10) === reviewedAt &&
      reviewedAt <= new Date().toISOString().slice(0, 10);
    if (!reviewer || reviewerPlaceholder.test(reviewer) ||
        !/[\p{L}]{2}/u.test(reviewer) ||
        /[\u0000-\u001F\u007F-\u009F\u061C\u200B\u200E-\u202E\u2060-\u206F\uFEFF]/u.test(reviewer) ||
        !reviewDateValid) gaps.push('human_legal_signoff');
    return { label: String(item.label), instrumentType: item.instrumentType || 'unknown',
      missingEvidence: gaps };
  });
  const errors = [];
  const incomplete = instruments.some(item => item.missingEvidence.length > 0);
  if (matrix.releaseSourceEligible === true && incomplete) errors.push('unsubstantiated_release_source');
  if (matrix.legalConclusionPermitted === true && incomplete) errors.push('unsubstantiated_legal_conclusion');
  // This script inventories research leads only. A forged "verified" status
  // must never suppress the release-flag conflict check or make the audit pass.
  if (matrix.status !== 'research-only') errors.push('invalid_research_status');
  if (matrix.releaseSourceEligible !== false || matrix.legalConclusionPermitted !== false) {
    errors.push('research_only_conflicts_with_release_flags');
  }
  return { status: errors.length ? 'INCONSISTENT_EVIDENCE' : 'RESEARCH_ONLY',
    topic: 'check', instruments, errors,
    note: 'This inventory never certifies legal correctness, commencement, or release readiness.' };
}

if (require.main === module) {
  const file = path.join(__dirname, '../docs/check-amendment-effective-date-matrix.json');
  let report;
  try { report = audit(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { report = { status: 'INVALID_EVIDENCE', errors: ['matrix_unavailable'] }; }
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
module.exports = { audit };
