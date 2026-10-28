#!/usr/bin/env node
'use strict';
// Read-only evidence inventory, not a legal opinion or publication approval.
const fs = require('node:fs');
const path = require('node:path');

function audit(matrix) {
  if (!matrix || matrix.topic !== 'check' || !Array.isArray(matrix.amendments)) {
    return { status: 'INVALID_EVIDENCE', topic: 'check', instruments: [], errors: ['invalid_matrix'] };
  }
  const instruments = matrix.amendments.map(item => {
    const gaps = [];
    const candidate = item.candidateInstrument;
    if (item.independentPrimaryAmendmentTextVerified !== true &&
        !(candidate && candidate.candidatePrimaryTextRetrieved === true)) {
      gaps.push('independent_primary_instrument');
    }
    if (!item.officialGazetteNumber || !item.officialGazettePublicationDate ||
        (candidate && candidate.publicationResearchLead &&
         candidate.publicationResearchLead.primaryGazetteIssueRetrieved !== true)) {
      gaps.push('primary_official_gazette');
    }
    if (!item.effectiveDate ||
        (candidate && candidate.publicationResearchLead &&
         candidate.publicationResearchLead.effectiveDateIndependentlyVerified !== true)) {
      gaps.push('verified_effective_date');
    }
    if (item.transitionalApplicabilityVerified !== true) gaps.push('transitional_applicability');
    if (candidate && candidate.primaryTextObservation &&
        candidate.primaryTextObservation.subsequentAmendmentsChecked !== true) {
      gaps.push('subsequent_amendments');
    }
    if (!item.humanReviewer || !item.humanReviewedAt) gaps.push('human_legal_signoff');
    return { label: String(item.label), instrumentType: item.instrumentType || 'unknown',
      missingEvidence: gaps };
  });
  const errors = [];
  const incomplete = instruments.some(item => item.missingEvidence.length > 0);
  if (matrix.releaseSourceEligible === true && incomplete) errors.push('unsubstantiated_release_source');
  if (matrix.legalConclusionPermitted === true && incomplete) errors.push('unsubstantiated_legal_conclusion');
  if (matrix.status === 'research-only' &&
      (matrix.releaseSourceEligible === true || matrix.legalConclusionPermitted === true)) {
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
