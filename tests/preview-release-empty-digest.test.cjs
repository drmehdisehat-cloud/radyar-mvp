'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const baseline = {
  restoreEvidence: {
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
    restore_target_realpath: '/srv/isolated/radyar-restore',
    production_document_root: '/home/site/public_html',
    production_document_root_realpath: '/home/site/public_html',
    restore_completed_at: '2026-11-09T12:00:00.000Z',
    reviewed_at: '2026-11-09T13:00:00.000Z'
  },
  isolatedRestoreVerified: true,
  destinationEvidence: { matched: true, source_blob_sha1: '1'.repeat(40), expected_source_blob_sha1: '1'.repeat(40), source_sha256: 'b'.repeat(64), destination_sha256: 'b'.repeat(64), destination_realpath: '/srv/isolated-staging/dadyar-preview/index.html', production_document_root_realpath: '/home/site/public_html', destination_outside_document_root: true },
  mobileBrowserVerified: true,
  zeroApiRequestsVerified: true,
  humanReviewVerified: true,
  authenticatedHumanReviewAttested: true
};
test('empty deployment artifact cannot count as verified destination', () => {
  for (const hash of [EMPTY, EMPTY.toUpperCase()]) {
    const result = decidePreviewRelease({
      ...baseline,
      destinationEvidence: { ...baseline.destinationEvidence, source_sha256: hash, destination_sha256: hash }
    });
    assert.equal(result.status, 'NOT_READY');
    assert.ok(result.blockers.includes('preview destination is not verified outside production document root'));
  }
});
test('nonempty-shaped synthetic evidence only reaches owner approval, never automatic deployment', () => {
  const decision = decidePreviewRelease(baseline);
  assert.equal(decision.status, 'EVIDENCE_SHAPE_VALID_REQUIRES_EXTERNAL_VERIFICATION');
  assert.equal(decision.deploymentAuthorized, false);
});
