'use strict';
// Regression checks for fail-closed release decisions. Synthetic inputs are NOT
// evidence of real backup recovery, mobile verification or owner approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');
const sha = 'a'.repeat(64);
const restoreEvidence = {
  restore_proven: true,
  evidence: 'independent-restore-manifest-v1',
  archive_sha256: 'b'.repeat(64),
  restored_marker_sha256: 'c'.repeat(64),
  restore_log_sha256: 'd'.repeat(64),
  database_probe_sha256: 'e'.repeat(64),
  restore_exit_code: 0,
  restore_target_isolated: true,
  production_database_untouched: true,
  database_probe_passed: true,
  outbound_integrations_disabled: true,
  reviewer_attested: true,
  restore_target_id: 'synthetic-isolated-target',
  restore_operator: 'Hosting operator',
  independent_reviewer: 'Independent reviewer',
  restore_database_name: 'radyar_restore',
  production_database_name: 'radyar_live',
  restore_database_user: 'radyar_restore_user',
  production_database_user: 'radyar_live_user',
  restore_target_path: '/srv/isolated/radyar-restore',
  production_document_root: '/home/site/public_html',
  restore_completed_at: '2026-11-09T12:00:00.000Z',
  reviewed_at: '2026-11-09T13:00:00.000Z'
};
const valid = {
  restoreEvidence,
  destinationEvidence: { matched: true, source_sha256: sha, destination_sha256: sha },
  isolatedRestoreVerified: true,
  mobileBrowserVerified: true,
  zeroApiRequestsVerified: true,
  humanReviewVerified: true
};
test('every release evidence flag must be literal boolean true', () => {
  for (const key of ['isolatedRestoreVerified', 'mobileBrowserVerified', 'zeroApiRequestsVerified', 'humanReviewVerified']) {
    for (const invalid of ['true', 1, {}, null, undefined]) {
      const result = decidePreviewRelease({ ...valid, [key]: invalid });
      assert.equal(result.status, 'NOT_READY', key + ': ' + String(invalid));
      assert.ok(result.blockers.length > 0);
    }
  }
});
test('destination cannot be accepted with missing, malformed, empty or nonmatching hashes', () => {
  for (const bad of ['', 'a'.repeat(63), 'g'.repeat(64), '0'.repeat(64), null]) {
    const result = decidePreviewRelease({
      ...valid,
      destinationEvidence: { matched: true, source_sha256: bad, destination_sha256: bad }
    });
    assert.equal(result.status, 'NOT_READY');
    assert.ok(result.blockers.includes('deployed destination integrity not proven'));
  }
});
test('bare restore boolean and old archive-checker output cannot authorize deployment', () => {
  for (const restoreEvidence of [
    { restore_proven: true },
    { restore_proven: false, evidence: 'archive-integrity-and-restored-file-only' }
  ]) {
    const result = decidePreviewRelease({ ...valid, restoreEvidence });
    assert.equal(result.status, 'NOT_READY');
    assert.ok(result.blockers.includes('independent restore attestation incomplete or unverified'));
  }
});
test('restore attestation rejects missing hashes, failed restore, or missing isolation checks', () => {
  const invalidCases = [
    { archive_sha256: '' },
    { restored_marker_sha256: '0'.repeat(64) },
    { restore_log_sha256: null },
    { database_probe_sha256: 'not-a-hash' },
    { restore_exit_code: 1 },
    { restore_target_isolated: false },
    { production_database_untouched: false },
    { database_probe_passed: false },
    { outbound_integrations_disabled: false },
    { reviewer_attested: false },
    { restore_target_id: '' }
  ];
  for (const patch of invalidCases) {
    const result = decidePreviewRelease({ ...valid, restoreEvidence: { ...restoreEvidence, ...patch } });
    assert.equal(result.status, 'NOT_READY', JSON.stringify(patch));
    assert.ok(result.blockers.includes('independent restore attestation incomplete or unverified'));
  }
});
test('restore attestation rejects production paths, shared databases and non-independent reviewers', () => {
  const invalidCases = [
    { restore_target_path: '/home/site/public_html/restore' },
    { restore_target_path: '/home/site/public_html' },
    { restore_database_name: 'radyar_live' },
    { restore_database_user: 'radyar_live_user' },
    { independent_reviewer: 'Hosting operator' },
    { reviewed_at: '2026-11-09T11:00:00.000Z' },
    { restore_completed_at: 'not-a-date' }
  ];
  for (const patch of invalidCases) {
    const result = decidePreviewRelease({ ...valid, restoreEvidence: { ...restoreEvidence, ...patch } });
    assert.equal(result.status, 'NOT_READY', JSON.stringify(patch));
    assert.ok(result.blockers.includes('independent restore attestation incomplete or unverified'));
  }
});
