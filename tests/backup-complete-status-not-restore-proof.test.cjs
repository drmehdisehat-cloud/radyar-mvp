'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decidePreviewRelease,
  hasProviderBoundRestoreAttestation
} = require('../scripts/decide-preview-release.cjs');

test('a provider Complete label and archive size alone are not an isolated restore proof', () => {
  const metadataOnly = {
    backup_provider: 'iranhost',
    source_site_origin: 'https://mehdisehat.ir',
    backup_id: 'synthetic-backup-1405-11-20',
    backup_status: 'Complete',
    archive_size_bytes: 140380000
  };

  assert.equal(hasProviderBoundRestoreAttestation(metadataOnly), false);
  const decision = decidePreviewRelease({ restoreEvidence: metadataOnly });
  assert.equal(decision.status, 'NOT_READY');
  assert.equal(decision.deploymentAuthorized, false);
  assert.ok(
    decision.blockers.includes('backup metadata is not proof of an isolated restore'),
    'release preflight must explain why a Complete label or archive size is insufficient'
  );
});

test('a Complete label without restore execution, isolated database probe and independent signatures remains blocked', () => {
  const metadataOnly = {
    status: 'Complete',
    archive_size_bytes: 140380000,
    backup_created_at: '2026-11-19T10:00:00.000Z'
  };
  const decision = decidePreviewRelease({ restoreEvidence: metadataOnly });
  assert.equal(decision.status, 'NOT_READY');
  assert.equal(decision.deploymentAuthorized, false);
  assert.ok(decision.blockers.includes('backup metadata is not proof of an isolated restore'));
  assert.ok(decision.blockers.includes('two-party restore signatures and independently pinned key fingerprints missing'));
});

test('all provider status and size aliases remain diagnostic only, including the 140.38 MB claim', () => {
  const statusAliases = ['backup_status', 'status', 'state'];
  const sizeAliases = ['archive_size_bytes', 'archive_size_mb', 'archive_size'];
  const sizeClaims = [140380000, 140.38, '140.38 MB'];

  for (const statusKey of statusAliases) {
    for (const sizeKey of sizeAliases) {
      for (const sizeValue of sizeClaims) {
        const metadataOnly = {
          [statusKey]: 'Complete',
          [sizeKey]: sizeValue,
          backup_provider: 'iranhost',
          source_site_origin: 'https://mehdisehat.ir',
          backup_id: 'synthetic-backup-alias-regression'
        };
        assert.equal(
          hasProviderBoundRestoreAttestation(metadataOnly),
          false,
          statusKey + ' plus ' + sizeKey + ' must never prove a restore'
        );
        const decision = decidePreviewRelease({ restoreEvidence: metadataOnly });
        assert.equal(decision.status, 'NOT_READY');
        assert.equal(decision.deploymentAuthorized, false);
        assert.ok(decision.blockers.includes('backup metadata is not proof of an isolated restore'));
      }
    }
  }
});
