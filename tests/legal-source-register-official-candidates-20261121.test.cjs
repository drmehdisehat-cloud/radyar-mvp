'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  auditLegalSourceRegister,
  directOfficialDocumentUrl
} = require('../backend/legal-source-register-policy.cjs');

const register = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/legal-source-register-v1.json'),
  'utf8'
));

test('new criminal and family law leads remain direct official candidates, not answer sources', () => {
  const expected = [
    {
      id: 'islamic-penal-code-1392',
      url: 'https://rc.majlis.ir/fa/law/show/845048',
      documentId: '845048',
      topicHints: ['سرقت', 'کلاهبرداری', 'جعل', 'ضرب و جرح', 'جرائم تعزیری']
    },
    {
      id: 'family-protection-law-1391',
      url: 'https://qavanin.ir/Law/TreeText/?IDS=5917848193987091276',
      documentId: '5917848193987091276',
      topicHints: ['طلاق', 'مهریه', 'نفقه', 'حضانت', 'دعاوی خانواده']
    }
  ];

  for (const item of expected) {
    const record = register.records.find(entry => entry.id === item.id);
    assert.ok(record, item.id + ' research record missing');
    assert.deepEqual(record.topicHints, item.topicHints);
    assert.equal(record.primarySourceVerified, false);
    assert.equal(record.humanReviewStatus, 'pending');
    assert.equal(record.useInLegalAnswers, false);
    assert.equal(record.eventDateVersioningRequired, true);

    const candidate = record.officialDocumentUrlCandidates?.find(entry => entry.url === item.url);
    assert.ok(candidate, item.id + ' direct official URL candidate missing');
    assert.equal(candidate.documentId, item.documentId);
    assert.equal(directOfficialDocumentUrl(candidate.url, candidate.documentId), true);
    assert.match(candidate.candidateStatus, /direct-fetch-timeout/);
    assert.equal(candidate.textRetrieved, false);
    assert.equal(candidate.rawHttpBytesCaptured, false);
    assert.equal(candidate.rawResponseSha256, null);
    assert.equal(candidate.humanReviewStatus, 'pending');
    assert.equal(candidate.useInLegalAnswers, false);
  }
});

test('research-only official leads never increase legal-answer eligibility', () => {
  const audit = auditLegalSourceRegister(register);
  assert.equal(audit.valid, true, audit.issues.join('\\n'));
  assert.equal(audit.structuralOnly, true);
  assert.deepEqual(audit.answerEligibleRecordIds, []);
  for (const id of ['islamic-penal-code-1392', 'family-protection-law-1391']) {
    assert.equal(audit.structurallyCompleteRecordIds.includes(id), false);
  }
});
