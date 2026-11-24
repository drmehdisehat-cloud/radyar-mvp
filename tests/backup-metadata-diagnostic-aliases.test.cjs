'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePreviewRelease } = require('../scripts/decide-preview-release.cjs');

test('empty preferred backup status cannot mask a Complete fallback status', () => {
  const decision = decidePreviewRelease({
    restoreEvidence: { backup_status: '', status: 'Complete' }
  });
  assert.equal(decision.status, 'NOT_READY');
  assert.equal(decision.deploymentAuthorized, false);
  assert.ok(decision.blockers.includes('backup metadata is not proof of an isolated restore'));
});

test('human-readable and megabyte archive sizes are diagnostic metadata, never restore proof', () => {
  for (const restoreEvidence of [
    { archive_size_mb: 140.38 },
    { archive_size: '140.38 MB' },
    { archive_size: '147200000 bytes' }
  ]) {
    const decision = decidePreviewRelease({ restoreEvidence });
    assert.equal(decision.status, 'NOT_READY');
    assert.equal(decision.deploymentAuthorized, false);
    assert.ok(decision.blockers.includes('backup metadata is not proof of an isolated restore'));
  }
});

test('malformed or non-positive size labels do not masquerade as a valid size claim', () => {
  const decision = decidePreviewRelease({
    restoreEvidence: { backup_status: 'in progress', archive_size: '0 MB' }
  });
  assert.equal(decision.status, 'NOT_READY');
  assert.equal(decision.deploymentAuthorized, false);
  assert.ok(decision.blockers.includes('independent restore attestation incomplete or unverified'));
  assert.ok(!decision.blockers.includes('backup metadata is not proof of an isolated restore'));
});
