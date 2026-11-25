'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { auditLegalSourceRegister } = require('../backend/legal-source-register-policy.cjs');

const root = path.join(__dirname, '..');
const register = JSON.parse(fs.readFileSync(path.join(root, 'docs/legal-source-register-v1.json'), 'utf8'));
const indexData = JSON.parse(fs.readFileSync(path.join(root, 'dadyar-preview/data/delay-damages-index.json'), 'utf8'));

test('legal source register is versioned and preserves fail-closed promotion rules', () => {
  assert.equal(register.schema, 'dadyar-legal-source-register-v1');
  assert.equal(register.policy.defaultUseInLegalAnswers, false);
  assert.ok(Array.isArray(register.records) && register.records.length >= 4);

  const ids = register.records.map(record => record.id);
  assert.equal(new Set(ids).size, ids.length, 'source record IDs must be unique');

  for (const record of register.records) {
    assert.equal(typeof record.primarySourceVerified, 'boolean', record.id + ' must state primary-source verification');
    assert.ok(['pending', 'approved', 'rejected'].includes(record.humanReviewStatus), record.id + ' must state human-review status');
    assert.equal(typeof record.useInLegalAnswers, 'boolean', record.id + ' must state answer-use permission');
    if (record.primarySourceVerified !== true || record.humanReviewStatus !== 'approved') {
      assert.equal(record.useInLegalAnswers, false, record.id + ' cannot support answers before source verification and review');
    }
    for (const lead of record.secondaryResearchLeads || []) {
      assert.equal(lead.sourceClass, 'secondary', record.id + ' research lead must be labelled secondary');
      assert.match(lead.url, /^https:\/\//, record.id + ' research lead must use HTTPS');
    }
  }

  const audit = auditLegalSourceRegister(register);
  assert.equal(audit.valid, true, audit.issues.join('\n'));
  assert.equal(audit.structuralOnly, true);
});

test('Qavanin cheque-law URLs remain non-authorizing research candidates until the consolidated text and event-date amendments are fetched and reviewed', () => {
  const record = register.records.find(item => item.id === 'check-issuance-law');
  assert.equal(record.latest1372Observation.file, 'docs/check-law-qavanin-recheck-20261125.json');
  assert.equal(record.latest1372Observation.observedAt, '2026-11-25');
  assert.ok(record);
  const original = record.officialDocumentUrlCandidates?.find(item =>
    item.url === 'https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131'
  );
  assert.ok(original, 'official original-law text URL must remain discoverable');
  assert.equal(original.candidateStatus, 'official-consolidated-text-and-original-metadata-rendered-2026-11-25-raw-bytes-not-captured');
  assert.match(original.lastDirectFetchResult, /On 2026-11-25 the Qavanin TreeText and Attribute pages rendered/);
  assert.equal(original.currentConsolidatedTextVerified, false);
  assert.equal(original.amendmentEffectiveDatesVerified, false);
  assert.equal(original.humanReviewStatus, 'pending');
  assert.equal(original.useInLegalAnswers, false);

  const amendment = record.officialDocumentUrlCandidates.find(item =>
    item.url === 'https://qavanin.ir/Law/TreeText/?IDS=8508483613671622689'
  );
  assert.ok(amendment, '2020 amendment candidate must be retained for direct retrieval');
  assert.equal(amendment.candidateStatus, 'official-primary-text-and-metadata-rendered-2026-11-22-raw-bytes-not-captured');
  assert.equal(amendment.sourceClass, 'primary-official-qavanin');
  assert.equal(amendment.lastDirectFetchResult, 'official-amendment-text-and-metadata-readable-via-independent-web-rendering; raw-response-bytes-and-sha256-not-captured');
  assert.equal(amendment.officialGazetteNumberShown, '22188');
  assert.equal(amendment.officialGazetteDateShown, '1400/03/02');
  assert.equal(amendment.effectiveFromShown, '1400/03/18');
  assert.equal(amendment.lastDirectFetchAt, '2026-11-22');
  assert.equal(amendment.metadataRetrievedAt, '2026-11-22');
  assert.deepEqual(amendment.metadataPageLines, [19, 21, 22, 24, 26, 30, 32, 33, 34]);
  assert.equal(amendment.textPageRendered, true);
  assert.equal(amendment.metadataPageRendered, true);
  assert.equal(amendment.rawHttpBytesCaptured, false);
  assert.equal(amendment.rawResponseSha256, null);
  assert.equal(amendment.humanReviewStatus, 'pending');
  assert.equal(amendment.useInLegalAnswers, false);

  const amendment1397 = record.officialDocumentUrlCandidates.find(item =>
    item.documentId === '3613585600919945767'
  );
  assert.ok(amendment1397);
  assert.equal(amendment1397.officialGazetteNumberShown, '21467');
  assert.equal(amendment1397.lastDirectFetchAt, '2026-11-22');
  assert.equal(amendment1397.metadataRetrievedAt, '2026-11-22');
  assert.equal(amendment1397.rawHttpBytesCaptured, false);
  assert.equal(amendment1397.officialGazetteDateShown, '1397/09/05');
  assert.equal(amendment1397.effectiveFromShown, '1397/09/21');
  assert.equal(amendment1397.useInLegalAnswers, false);


  const amendment1372 = record.officialDocumentUrlCandidates.find(item =>
    item.documentId === '16863897128756457315'
  );
  assert.ok(amendment1372, '1372 official Qavanin text lead must be retained');
  assert.equal(amendment1372.candidateStatus,
    'official-primary-text-and-metadata-rendered-2026-11-25-raw-bytes-and-gazette-issue-not-captured');
  assert.equal(amendment1372.approvalDateShown, '1372/08/11');
  assert.equal(amendment1372.guardianCouncilConfirmationDateShown, '1372/08/19');
  assert.equal(amendment1372.lastDirectFetchAt, '2026-11-25');
  assert.equal(amendment1372.officialGazetteNumberShown, '14189');
  assert.equal(amendment1372.officialGazetteDateShown, '1372/09/01');
  assert.equal(amendment1372.officialGazettePublicationDateShown, '1372/09/01');
  assert.equal(amendment1372.promulgationDateShown, '1372/08/25');
  assert.equal(amendment1372.effectiveFromShown, '1372/09/17');
  assert.equal(amendment1372.metadataLastDirectFetchAt, '2026-11-25');
  assert.equal(amendment1372.rawHttpBytesCaptured, false);
  assert.equal(amendment1372.rawResponseSha256, null);
  assert.equal(amendment1372.officialGazetteIssueBytesRetrieved, false);
  assert.equal(amendment1372.eventDateVersioningApproved, false);
  assert.equal(amendment1372.humanReviewStatus, 'pending');
  assert.equal(amendment1372.useInLegalAnswers, false);

  const observed1372 = record.officialPortalObservation.amendmentPages.find(item =>
    item.id === 'check-amendment-1372'
  );
  assert.ok(observed1372);
  assert.equal(observed1372.rawHttpBytesCaptured, false);
  assert.equal(observed1372.rawResponseSha256, null);
  assert.equal(observed1372.metadataRendered, true);
  assert.equal(observed1372.officialGazetteNumber, '14189');
  assert.equal(observed1372.publicationDate, '1372/09/01');
  assert.equal(observed1372.promulgationDateShown, '1372/08/25');
  assert.equal(observed1372.effectiveFrom, '1372/09/17');
  assert.equal(observed1372.metadataRetrievedAt, '2026-11-23');
  assert.equal(observed1372.humanReviewStatus, 'pending');

  const amendment1403 = record.officialDocumentUrlCandidates.find(item =>
    item.documentId === '634882870797924421'
  );
  assert.ok(amendment1403);
  assert.equal(amendment1403.lastDirectFetchResult, 'request-timeout');
  assert.equal(amendment1403.useInLegalAnswers, false);

  assert.equal(record.primaryOfficialDocumentUrl, null);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
});

test('registry retains the 2026-11-23 source observations while tracking the 2026-11-25 recheck', () => {
  assert.equal(register.observedAt, '2026-11-25');
  const record = register.records.find(item => item.id === 'check-issuance-law');
  const page = record.officialPortalObservation.amendmentPages.find(item => item.id === 'check-amendment-1400');
  assert.ok(page);
  assert.equal(page.lastObservedAt, '2026-11-22');
  assert.equal(page.metadataRetrievedAt, '2026-11-22');
  assert.deepEqual(page.metadataPageLines, [19, 21, 22, 24, 26, 30, 32, 33, 34]);
  assert.match(page.renderedTextExcerpt, /ماده 1-/);
  assert.match(page.renderedTextExcerpt, /ماده 24-/);
  assert.equal(page.officialGazetteNumber, '22188');
  assert.equal(page.publicationDate, '1400/03/02');
  assert.equal(page.effectiveFrom, '1400/03/18');
  assert.equal(page.rawHttpBytesCaptured, false);
  assert.equal(page.rawResponseSha256, null);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
});

test('reported uniform opinion 883 remains a research lead, not an activated legal rule', () => {
  const record = register.records.find(item => item.id === 'uniform-opinion-883');
  assert.ok(record);
  assert.equal(record.reportedNumber, 883);
  assert.equal(record.numberStatus, 'secondary-claims-only');
  assert.equal(record.identifierStatus, 'secondary-claims-not-reconciled');
  assert.equal(record.decisionDate, '1405-07-21');
  assert.equal(record.reportedGazettePublication, 'secondary-claims-only');
  assert.deepEqual(record.secondaryIdentifierClaims.map(item => item.value), ['1404/2', '2/1405']);
  assert.ok(record.secondaryIdentifierClaims.every(item => item.sourceClass === 'secondary'));
  assert.ok(record.openQuestions.some(item => /شناسه پرونده وحدت رویه/.test(item)));
  assert.match(record.reportedRuleSummary, /منابع ثانویه/);
  assert.ok(record.openQuestions.some(item => /روزنامه رسمی/.test(item)));
  assert.equal(record.useInLegalAnswers, false);
});

test('unreconciled CBI secondary index lead cannot overwrite the owner-image series', () => {
  const record = register.records.find(item => item.id === 'cbi-urban-consumer-index-1405');
  assert.ok(record);
  assert.equal(record.secondaryDiscrepancyLead.reportedValue, 836.8);
  assert.equal(record.secondaryDiscrepancyLead.sourceClass, 'secondary-aggregator');

  if (record.useInLegalAnswers !== true) {
    assert.equal(indexData.source.status, 'transcribed-not-independently-authenticated');
    assert.equal(indexData.baseYearStatus, 'inferred-from-1395-average-100-in-owner-image; not-independently-verified');
    assert.equal(indexData.months['7'], 3611.1);
    assert.notEqual(indexData.months['7'], record.secondaryDiscrepancyLead.reportedValue);
  } else {
    assert.notEqual(indexData.source.status, 'transcribed-not-independently-authenticated');
  }
});

test('July CBI official-channel URL remains an unverified lead and cannot replace the owner-image series', () => {
  const record = register.records.find(item => item.id === 'cbi-urban-consumer-index-1405');
  assert.ok(record);
  const candidate = record.officialDocumentUrlCandidates?.find(item =>
    item.url === 'https://cbi.ir/showitem/35817.aspx'
  );
  assert.ok(candidate, 'July CBI direct URL must be retained as a research lead');
  assert.equal(candidate.candidateStatus, 'official-url-not-readable-in-current-independent-verification-2026-11-18');
  assert.equal(candidate.reportedPublicationDate, '1405-05-06');
  assert.equal(candidate.reportedMonth, '1405-04');
  assert.equal(candidate.reportedValue, 742.8);
  assert.equal(candidate.lastDirectFetchResult, 'not-accessible-via-current-independent-web-verification');
  assert.match(candidate.note, /سال پایه/);
  assert.equal(record.primaryOfficialDocumentUrl, null);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
  assert.equal(indexData.source.status, 'transcribed-not-independently-authenticated');
  assert.equal(indexData.months['4'], 3205.1);
});

test('direct CBI page unavailable through this verification channel remains a non-authorizing research candidate', () => {
  const record = register.records.find(item => item.id === 'cbi-urban-consumer-index-1405');
  assert.ok(record);
  const candidate = record.officialDocumentUrlCandidates?.find(item =>
    item.url === 'https://cbi.ir/showitem/36735.aspx'
  );
  assert.ok(candidate, 'direct CBI URL candidate must be retained for operator follow-up');
  assert.equal(candidate.candidateStatus, 'official-url-not-readable-in-current-independent-verification-2026-11-18');
  assert.equal(candidate.reportedMonth, '1405-07');
  assert.equal(candidate.reportedValue, 836.8);
  assert.equal(candidate.lastDirectFetchResult, 'not-accessible-via-current-independent-web-verification');
  assert.equal(record.primaryOfficialDocumentUrl, null);
  assert.equal(record.primarySourceVerified, false);
  assert.equal(record.humanReviewStatus, 'pending');
  assert.equal(record.useInLegalAnswers, false);
  assert.equal(indexData.source.status, 'transcribed-not-independently-authenticated');
  assert.equal(indexData.months['7'], 3611.1);
});


test('1372 Qavanin rendered-text digest binds the exact transcription without masquerading as raw official bytes', () => {
  const record = register.records.find(item => item.id === 'check-issuance-law');
  const observation = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/check-law-qavanin-observation-20261123.json'), 'utf8'
  ));
  const capture = observation.renderedTextCapture;
  assert.ok(record && capture, '1372 observation and legal-source record must exist');
  assert.equal(record.latest1372Observation.file, 'docs/check-law-qavanin-recheck-20261125.json');
  assert.equal(capture.path, 'research/qavanin-1372-check-amendment-rendered-20261123.txt');
  const candidate = record.officialDocumentUrlCandidates.find(item =>
    item.documentId === '16863897128756457315'
  );
  assert.ok(candidate, '1372 official Qavanin candidate must exist');
  assert.equal(capture.sourceUrl, candidate.url);
  const bytes = fs.readFileSync(path.join(root, capture.path));
  assert.equal(bytes.length, capture.utf8Bytes, 'transcription byte length must match its observation');
  assert.equal(bytes.toString('utf8').split(/\r?\n/).length, capture.lineCount,
    'transcription line count must match the visible-line capture');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), capture.sha256,
    'transcription SHA-256 must match the exact repository bytes');
  assert.deepEqual(capture.sourceVisibleLineRange, [42, 68]);
  assert.equal(capture.captureType, 'web-rendered official portal text copied from visible lines');
  assert.equal(capture.rawHttpResponseBytesCaptured, false);
  assert.equal(capture.rawResponseSha256, null);
  assert.equal(observation.verification.rawHttpBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);
  assert.equal(candidate.useInLegalAnswers, false);
  assert.equal(record.useInLegalAnswers, false);
});
