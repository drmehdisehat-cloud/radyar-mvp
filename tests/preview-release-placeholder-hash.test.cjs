'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');

const base = {
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
  destinationEvidence: { matched: true, source_blob_sha1: '1'.repeat(40), expected_source_blob_sha1: '1'.repeat(40), source_sha256: 'a'.repeat(64), destination_sha256: 'a'.repeat(64), destination_realpath: '/srv/isolated-staging/dadyar-preview/index.html', production_document_root_realpath: '/home/site/public_html', destination_outside_document_root: true },
  mobileBrowserVerified: true,
  zeroApiRequestsVerified: true,
  humanReviewVerified: true
};

test('preview gate rejects placeholder all-zero SHA-256 even when matched flag is true', () => {
  const placeholder = '0'.repeat(64);
  const decision = decidePreviewRelease({
    ...base,
    destinationEvidence: { ...base.destinationEvidence, source_sha256: placeholder, destination_sha256: placeholder }
  });
  assert.equal(decision.status, 'NOT_READY');
  assert.ok(decision.blockers.includes('preview destination is not verified outside production document root'));
});

test('valid-shaped synthetic hashes and manifest only permit owner approval, never auto-deploy', () => {
  const decision = decidePreviewRelease(base);
  assert.equal(decision.status, 'READY_FOR_OWNER_DEPLOYMENT_APPROVAL');
  assert.deepEqual(decision.blockers, []);
});
