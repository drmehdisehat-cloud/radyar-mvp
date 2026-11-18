'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
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
  assert.ok(record);
  const original = record.officialDocumentUrlCandidates?.find(item =>
    item.url === 'https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131'
  );
  assert.ok(original, 'official original-law text URL must remain discoverable');
  assert.equal(original.candidateStatus, 'official-url-returns-transfer-interstitial-no-law-text-2026-11-18');
  assert.equal(original.lastDirectFetchResult, 'transfer-interstitial-only-no-law-text');
  assert.equal(original.currentConsolidatedTextVerified, false);
  assert.equal(original.amendmentEffectiveDatesVerified, false);
  assert.equal(original.humanReviewStatus, 'pending');
  assert.equal(original.useInLegalAnswers, false);

  const amendment = record.officialDocumentUrlCandidates.find(item =>
    item.url === 'https://qavanin.ir/Law/TreeText/?IDS=8508483613671622689'
  );
  assert.ok(amendment, '2020 amendment candidate must be retained for direct retrieval');
  assert.equal(amendment.candidateStatus, 'secondary-link-discovered-not-fetched');
  assert.equal(amendment.sourceClass, 'secondary-link-discovery');
  assert.equal(amendment.lastDirectFetchResult, 'request-timeout');
  assert.equal(amendment.humanReviewStatus, 'pending');
  assert.equal(amendment.useInLegalAnswers, false);

  assert.equal(record.primaryOfficialDocumentUrl, null);
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
