'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');

const preview = fs.readFileSync(
  path.resolve(__dirname, '../dadyar-preview/index.html'),
  'utf8'
);

const restoreEvidence = {
  evidence: 'independent-restore-manifest-v1',
  restore_proven: true,
  backup_provider: 'iranhost',
  source_site_origin: 'https://mehdisehat.ir',
  backup_id: 'synthetic-iranhost-backup-001',
  backup_created_at: '2026-11-09T10:00:00.000Z',
  archive_size_bytes: 140380000,
  archive_sha256: 'a'.repeat(64),
  restored_marker_sha256: 'b'.repeat(64),
  restore_log_sha256: 'c'.repeat(64),
  database_probe_sha256: 'd'.repeat(64),
  restore_exit_code: 0,
  restore_target_isolated: true,
  production_database_untouched: true,
  database_probe_passed: true,
  outbound_integrations_disabled: true,
  reviewer_attested: true,
  restore_target_id: 'synthetic-isolated-target',
  restore_operator: 'Synthetic hosting operator',
  independent_reviewer: 'Synthetic independent reviewer',
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
};

const destinationEvidence = {
  matched: true,
  source_blob_sha1: '1'.repeat(40),
  expected_source_blob_sha1: '1'.repeat(40),
  source_sha256: 'e'.repeat(64),
  destination_sha256: 'e'.repeat(64),
  destination_realpath: '/srv/isolated-staging/dadyar-preview/index.html',
  production_document_root_realpath: '/home/site/public_html',
  git_checkout_realpath: '/srv/radyar-checkout',
  destination_outside_document_root: true,
  destination_outside_git_checkout: true
};

test('offline local review never substitutes for authenticated reviewer identity at release', () => {
  assert.match(preview, /بازبینی محلی توسط انسان \(بدون احراز هویت\)/);
  assert.match(preview, /هویت بازبین احراز نمی‌شود/);
  assert.match(preview, /connect-src 'none'/);

  // All other evidence flags are deliberately synthetic and complete. The
  // trusted server-side identity adapter remains absent, so release must fail closed.
  const decision = decidePreviewRelease({
    restoreEvidence,
    destinationEvidence,
    isolatedRestoreVerified: true,
    mobileBrowserVerified: true,
    zeroApiRequestsVerified: true,
    localHumanReviewAcknowledged: true,
    authenticatedHumanReviewAttested: true,
    authenticatedRestoreAttestation: true,
    trustedReviewerAuthenticationAdapterVerified: false
  });

  assert.equal(decision.status, 'NOT_READY');
  assert.ok(decision.blockers.includes(
    'trusted reviewer authentication adapter is not integrated and verified'
  ));
  assert.equal(decision.deploymentAuthorized, false);
});
